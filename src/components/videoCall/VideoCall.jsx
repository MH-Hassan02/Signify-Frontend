import React, { useState, useEffect, useRef } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaPhoneSlash,
} from "react-icons/fa";
import { toast } from "react-toastify";
import socket from "../../socket";
import "./VideoCall.css";
import { useVideoCall } from "../../contexts/VideoCallContext";
import { useNavigate, useLocation } from "react-router-dom";

const VideoCall = ({
  currentUser,
  contactId,
  contactProfilePic,
  contactUsername,
  onClose,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isIncomingCall, callData } = location.state || {};

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const iceCandidatesQueue = useRef([]);
  const hasInitiatedCall = useRef(false);

  const { setIncomingCall, isCalling, setIsCalling } = useVideoCall();
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const mountedRef = useRef(false);
  const videoPlaybackRef = useRef(false);
  const pendingPlayPromiseRef = useRef(null);
  const activeVideoSenderRef = useRef(null);

  // Add this state to track toggle operation
  const [isTogglingVideo, setIsTogglingVideo] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    
    // Check URL parameters for call mode
    const urlParams = new URLSearchParams(window.location.search);
    const isReceiving = urlParams.get('receiving') === 'true';
    
    if (isReceiving) {
      console.log("[INIT] Component mounted in receiver mode");
    }

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  const setupVideoTrack = async (track, videoElement) => {
    if (!track || !videoElement) return;
    
    // Force enable the track
    track.enabled = true;
    
    // Create a new stream with just this track
    const stream = new MediaStream([track]);
    
    // Set up the video element
    videoElement.srcObject = stream;
    videoElement.playsInline = true;
    videoElement.autoplay = true;
    
    try {
        await videoElement.play();
        console.log(`[VIDEO] Started playing ${track.kind} track:`, track.id);
    } catch (err) {
        console.warn(`[VIDEO] Failed to play ${track.kind} track:`, err);
    }
  };

  const setupPeerConnection = async (stream) => {
    console.log("[PEER] Setting up new peer connection");
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    // Add each track to the peer connection
    stream.getTracks().forEach(track => {
        console.log(`[PEER] Adding ${track.kind} track to connection`);
        pc.addTrack(track, stream);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log(`[PEER] Received ${event.track.kind} track`);
        
        if (event.streams && event.streams[0]) {
            const stream = event.streams[0];
            
            if (event.track.kind === 'video') {
                event.track.enabled = true;
                remoteStreamRef.current = stream;
                setRemoteStream(stream);
                
                // Set up remote video immediately
                setupVideoTrack(event.track, remoteVideoRef.current);
            }
        }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
        console.log("[PEER] Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
            // Re-enable tracks when connection is established
            const senders = pc.getSenders();
            senders.forEach(sender => {
                if (sender.track) {
                    sender.track.enabled = true;
                }
            });
        }
    };

    return pc;
  };

  const getLocalMedia = async () => {
    try {
      console.log("📹 Getting local media stream");
      
      // First check what devices are available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      const hasAudio = devices.some(device => device.kind === 'audioinput');
      
      console.log("[MEDIA] Available devices:", {
        video: hasVideo,
        audio: hasAudio,
        devices: devices.map(d => ({ kind: d.kind, label: d.label }))
      });

      // Set up constraints based on available devices
      const constraints = {
        video: hasVideo ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user',
        } : false,
        audio: hasAudio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        } : false
      };

      console.log("[MEDIA] Requesting media with constraints:", constraints);
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log detailed information about obtained tracks
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      
      if (videoTrack) {
        console.log("[MEDIA] Video track obtained:", {
          id: videoTrack.id,
          label: videoTrack.label,
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          readyState: videoTrack.readyState,
          settings: videoTrack.getSettings()
        });
      }
      
      if (audioTrack) {
        console.log("[MEDIA] Audio track obtained:", {
          id: audioTrack.id,
          label: audioTrack.label,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings()
        });
      }

      // Explicitly enable all tracks
      stream.getTracks().forEach(track => {
        track.enabled = true;
        console.log(`[MEDIA] Enabled ${track.kind} track:`, {
          id: track.id,
          enabled: track.enabled
        });

        // Set up track ended handler
        track.onended = () => {
          console.log(`[MEDIA] ${track.kind} track ended:`, track.id);
          // Try to restart the track if it ends unexpectedly
          if (track.kind === 'video' && isVideoOn) {
            console.log("[MEDIA] Attempting to restart video track");
            toggleVideo();
          }
        };
      });
      
      // Store the stream in both ref and state
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set up local video
      if (localVideoRef.current) {
        console.log("[MEDIA] Setting up local video element");
        localVideoRef.current.srcObject = stream;
        try {
          await localVideoRef.current.play();
          console.log("[MEDIA] Local video playing");
        } catch (err) {
          console.warn("[MEDIA] Initial local video play failed:", err);
          // Try again with user interaction
          const playOnClick = async () => {
            try {
              await localVideoRef.current.play();
              document.removeEventListener('click', playOnClick);
            } catch (playErr) {
              console.error("[MEDIA] Play failed even with user interaction:", playErr);
            }
          };
          document.addEventListener('click', playOnClick);
        }
      }
      
      return stream;
    } catch (err) {
      console.error("[MEDIA] Access error:", err);
      
      // Provide more specific error messages
      if (err.name === 'NotAllowedError') {
        toast.error("Please allow access to camera and microphone");
      } else if (err.name === 'NotFoundError') {
        toast.error("No camera or microphone found");
      } else if (err.name === 'NotReadableError') {
        toast.error("Camera or microphone is already in use");
      } else {
        toast.error("Failed to access camera or microphone");
      }
      
      throw err;
    }
  };

  const startCall = async () => {
    try {
      setIsCalling(true);
      
      const stream = await getLocalMedia();
      console.log("[CALLER] Local video track:", {
        enabled: stream.getVideoTracks()[0].enabled,
        readyState: stream.getVideoTracks()[0].readyState,
        settings: stream.getVideoTracks()[0].getSettings()
      });

      const pc = await setupPeerConnection(stream);
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call-user", {
        to: contactId,
        offer,
        from: currentUser,
      });
    } catch (err) {
      console.error("Call initiation failed:", err);
      toast.error("Failed to start call");
      setIsCalling(false);
    }
  };

  const handleIncomingCall = async () => {
    console.log("[RECEIVER] Starting incoming call flow with data:", callData);
    try {
      const stream = await getLocalMedia();
      console.log("[RECEIVER] Local media obtained");
      
      const pc = await setupPeerConnection(stream);
      console.log("[RECEIVER] Peer connection setup");

      // Set the remote description using the stored offer
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      console.log("[RECEIVER] Remote description set");

      // Create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("[RECEIVER] Local description set");

      // Send answer to caller
      socket.emit("answer-call", {
        to: callData.from._id,
        answer,
      });
      console.log("[RECEIVER] Answer sent to caller");

      // Process any queued ICE candidates
      if (iceCandidatesQueue.current.length > 0) {
        console.log("[RECEIVER] Processing queued ICE candidates:", iceCandidatesQueue.current.length);
        for (const candidate of iceCandidatesQueue.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidatesQueue.current = [];
      }
    } catch (err) {
      console.error("[RECEIVER] Error in incoming call flow:", err);
      toast.error("Failed to setup incoming call");
      endCall();
    }
  };

  useEffect(() => {
    const initializeCall = async () => {
      if (hasInitiatedCall.current) return;
      hasInitiatedCall.current = true;

      console.log("[INIT] Call initialization", {
        isIncomingCall,
        hasCallData: !!callData,
        isCalling
      });

      try {
        if (isIncomingCall && callData) {
          await handleIncomingCall();
        } else if (!isIncomingCall && contactId) {
          await startCall();
        }
      } catch (err) {
        console.error("[INIT] Call initialization failed:", err);
        endCall();
      }
    };

    initializeCall();
  }, []);

  const endCall = () => {
    console.log("📴 Ending call");
    
    // Send end call signal first
    socket.emit("end-call", { to: contactId });

    // Clean up peer connection
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.error("Error closing peer connection:", err);
      }
      peerConnectionRef.current = null;
    }

    // Clean up local stream
    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error("Error stopping local tracks:", err);
      }
      localStreamRef.current = null;
    }

    // Clean up remote stream
    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error("Error stopping remote tracks:", err);
      }
      remoteStreamRef.current = null;
    }

    // Clean up video elements
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    // Reset state
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setIncomingCall(null);
    setIsConnected(false);
    
    // Navigate away
    onClose?.();
    navigate("/calls", { replace: true });
  };

  useEffect(() => {
    socket.on("call-accepted", async ({ answer }) => {
      console.log("[CALLER] Call accepted, setting up remote connection");
      try {
        if (peerConnectionRef.current && answer) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          console.log("[CALLER] Remote description set successfully");
        }
      } catch (err) {
        console.error("[CALLER] Error setting remote description:", err);
      }
    });

    socket.on("call-ended", () => {
      toast.info("Call ended");
      endCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (peerConnectionRef.current && candidate) {
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
            console.log("ICE candidate added");
          } else {
            // Queue the candidate if remote description isn't set yet
            console.log("Queueing ICE candidate");
            iceCandidatesQueue.current.push(candidate);
          }
        }
      } catch (err) {
        console.error("Error handling ICE candidate:", err);
      }
    });

    socket.on("renegotiate", async ({ offer }) => {
        if (!peerConnectionRef.current) return;
        
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            socket.emit("renegotiate-answer", {
                to: contactId,
                answer: peerConnectionRef.current.localDescription
            });
        } catch (err) {
            console.error("[PEER] Error handling renegotiation:", err);
        }
    });

    socket.on("renegotiate-answer", async ({ answer }) => {
        if (!peerConnectionRef.current) return;
        
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("[PEER] Renegotiation completed");
        } catch (err) {
            console.error("[PEER] Error setting renegotiation answer:", err);
        }
    });

    socket.on("call-update", async ({ offer }) => {
        if (!peerConnectionRef.current) return;
        
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            
            socket.emit("call-update-answer", {
                to: contactId,
                answer: peerConnectionRef.current.localDescription
            });
        } catch (err) {
            console.error("[PEER] Error handling call update:", err);
        }
    });

    socket.on("call-update-answer", async ({ answer }) => {
        if (!peerConnectionRef.current) return;
        try {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error("[PEER] Error setting call update answer:", err);
        }
    });

    return () => {
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      socket.off("renegotiate");
      socket.off("renegotiate-answer");
      socket.off("call-update");
      socket.off("call-update-answer");
      endCall();
    };
  }, [contactId]);

  const safePlayVideo = async (videoElement) => {
    if (!videoElement || !videoElement.srcObject) {
        console.log("[VIDEO] No video element or source to play");
        return;
    }
    
    try {
        await videoElement.play();
        console.log("[VIDEO] Playback started successfully");
    } catch (err) {
        console.warn("[VIDEO] Playback failed:", err);
    }
  };

  const setupLocalVideo = async (stream) => {
    console.log("[LOCAL] Setting up local video");
    if (!localVideoRef.current || !stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    console.log("[LOCAL] Video track state:", {
        id: videoTrack.id,
        enabled: videoTrack.enabled,
        readyState: videoTrack.readyState,
        settings: videoTrack.getSettings()
    });

    try {
        // Create a new MediaStream just for this video element
        const localDisplayStream = new MediaStream([videoTrack]);
        localVideoRef.current.srcObject = localDisplayStream;
        await safePlayVideo(localVideoRef.current);
    } catch (err) {
        console.error("[LOCAL] Error setting up video:", err);
    }
  };

  const createVideoConstraints = () => ({
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user'
    }
  });

  const renegotiate = async () => {
    if (!peerConnectionRef.current) return;
    
    try {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        socket.emit("renegotiate", {
            to: contactId,
            offer: peerConnectionRef.current.localDescription
        });
    } catch (err) {
        console.error("[PEER] Renegotiation failed:", err);
    }
  };

  const toggleVideo = async () => {
    console.log("[TOGGLE] Starting video toggle");

    if (!isVideoOn) {
        try {
            // Get new video stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            });

            const newVideoTrack = stream.getVideoTracks()[0];
            if (!newVideoTrack) {
                throw new Error("No video track in new stream");
            }

            // Stop any existing tracks
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStreamRef.current.removeTrack(oldTrack);
            }

            // Add new track to local stream
            newVideoTrack.enabled = true;
            localStreamRef.current.addTrack(newVideoTrack);

            // Set up local video display
            await setupVideoTrack(newVideoTrack, localVideoRef.current);

            // Update peer connection
            if (peerConnectionRef.current) {
                const senders = peerConnectionRef.current.getSenders();
                const videoSender = senders.find(s => s.track?.kind === 'video');

                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                } else {
                    peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
                }

                // Create and send a new offer
                const offer = await peerConnectionRef.current.createOffer({
                    offerToReceiveVideo: true,
                    offerToReceiveAudio: true
                });
                await peerConnectionRef.current.setLocalDescription(offer);
                
                socket.emit("call-update", {
                    to: contactId,
                    offer: peerConnectionRef.current.localDescription
                });
            }

            setIsVideoOn(true);

        } catch (err) {
            console.error("[TOGGLE] Failed to enable video:", err);
            toast.error("Failed to turn on camera");
            setIsVideoOn(false);
        }
    } else {
        // Turning video off
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = false;
            videoTrack.stop();
            localStreamRef.current.removeTrack(videoTrack);

            // Clear local display
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }

            // Update peer connection
            if (peerConnectionRef.current) {
                const senders = peerConnectionRef.current.getSenders();
                const videoSender = senders.find(s => s.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(null);
                    
                    // Send an offer without video
                    const offer = await peerConnectionRef.current.createOffer({
                        offerToReceiveVideo: true,
                        offerToReceiveAudio: true
                    });
                    await peerConnectionRef.current.setLocalDescription(offer);
                    
                    socket.emit("call-update", {
                        to: contactId,
                        offer: peerConnectionRef.current.localDescription
                    });
                }
            }
        }
        setIsVideoOn(false);
    }
};

  // Add a cleanup function for video tracks
  const cleanupVideoTrack = (track) => {
    if (track) {
        try {
            track.enabled = false;
            track.stop();
        } catch (err) {
            console.error("[CLEANUP] Error cleaning up video track:", err);
        }
    }
  };

  // Modify the useEffect for remote video
  useEffect(() => {
    if (!remoteVideoRef.current || !remoteStream) return;

    const videoTrack = remoteStream.getVideoTracks()[0];
    if (videoTrack) {
        setupVideoTrack(videoTrack, remoteVideoRef.current);
    }

    return () => {
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
    };
}, [remoteStream]);

  const toggleMic = () => {
    console.log("[TOGGLE] Toggling microphone");
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
        console.log(`[TOGGLE] Microphone ${audioTrack.enabled ? 'enabled' : 'disabled'}`);

        // Update the track in peer connection
        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const audioSender = senders.find(sender => sender.track?.kind === 'audio');
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = audioTrack.enabled;
          }
        }
      }
    }
  };

  // Add new function to handle track replacement
  const replaceTrack = async (newTrack, kind) => {
    console.log(`[PEER] Replacing ${kind} track`);
    if (peerConnectionRef.current) {
      const senders = peerConnectionRef.current.getSenders();
      const sender = senders.find(s => s.track?.kind === kind);
      if (sender) {
        try {
          await sender.replaceTrack(newTrack);
          console.log(`[PEER] Successfully replaced ${kind} track`);
          return true;
        } catch (err) {
          console.error(`[PEER] Error replacing ${kind} track:`, err);
          return false;
        }
      }
    }
    return false;
  };

  return (
    <div className="videoCallWrapper">
      <div className="videoContainer">
        <div className="videoSlot">
          {!isVideoOn ? (
            <img
              src={currentUser.profilePic}
              alt={currentUser.username}
              className="videoCallVideo"
            />
          ) : (
            <video
              className="videoCallVideo local"
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: 'scaleX(-1)', backgroundColor: '#000000' }}
            />
          )}
          <p className="contactNameVideo">
            {currentUser?.username} {!isMicOn && <FaMicrophoneSlash />}
          </p>
        </div>

        <div className="videoSlot">
          {!remoteStream ? (
            <img
              src={contactProfilePic}
              alt={contactUsername}
              className="videoCallVideo"
            />
          ) : (
            <video
              className="videoCallVideo remote"
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ backgroundColor: '#000000' }}
            />
          )}
          <p className="contactNameVideo">{contactUsername}</p>
        </div>
      </div>

      <div className="videoControls">
        <button onClick={toggleMic}>
          {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOn ? <FaVideo /> : <FaVideoSlash />}
        </button>
        <button onClick={endCall} className="endCallBtn">
          <FaPhoneSlash />
        </button>
      </div>
    </div>
  );
};

export default VideoCall; 