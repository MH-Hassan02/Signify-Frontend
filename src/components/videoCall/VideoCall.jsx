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

  const setupPeerConnection = async (stream) => {
    console.log("[PEER] Setting up new peer connection");
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    // Add each track to the peer connection
    stream.getTracks().forEach(track => {
      const sender = pc.addTrack(track, stream);
      console.log(`[PEER] Added ${track.kind} track to connection:`, {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted
      });

      // Monitor sender's parameters
      const params = sender.getParameters();
      console.log(`[PEER] ${track.kind} sender parameters:`, params);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log(`[PEER] Received ${event.track.kind} track:`, {
        id: event.track.id,
        enabled: event.track.enabled,
        muted: event.track.muted,
        readyState: event.track.readyState
      });

      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        
        // Handle both audio and video tracks
        if (event.track.kind === 'video' || event.track.kind === 'audio') {
          // Force enable the track
          event.track.enabled = true;
          
          console.log(`[PEER] ${event.track.kind} track received:`, {
            id: event.track.id,
            enabled: event.track.enabled,
            readyState: event.track.readyState,
            settings: event.track.getSettings()
          });

          // Set the remote stream
          remoteStreamRef.current = stream;
          setRemoteStream(stream);

          // Monitor track state
          event.track.onunmute = () => {
            console.log(`[PEER] ${event.track.kind} track unmuted`);
            event.track.enabled = true;
            if (event.track.kind === 'video' && remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          };
          
          event.track.onmute = () => {
            console.log(`[PEER] ${event.track.kind} track muted`);
          };

          event.track.onended = () => {
            console.log(`[PEER] ${event.track.kind} track ended`);
          };
        }
      }
    };

    // Enhanced connection monitoring
    pc.onconnectionstatechange = () => {
      console.log("[PEER] Connection state changed:", pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsConnected(true);
        // Check media flow when connected
        pc.getReceivers().forEach(receiver => {
          if (receiver.track) {
            console.log(`[PEER] Receiver track state:`, {
              kind: receiver.track.kind,
              enabled: receiver.track.enabled,
              muted: receiver.track.muted,
              readyState: receiver.track.readyState
            });
          }
        });
      }
    };

    // Monitor ICE connection
    pc.oniceconnectionstatechange = () => {
      console.log("[PEER] ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        // Double check media flow
        setTimeout(() => {
          console.log("[PEER] Checking media flow after ICE connection");
          pc.getReceivers().forEach(receiver => {
            if (receiver.track) {
              console.log(`[PEER] Receiver track state after ICE:`, {
                kind: receiver.track.kind,
                enabled: receiver.track.enabled,
                muted: receiver.track.muted,
                readyState: receiver.track.readyState,
                stats: receiver.getStats()
              });
            }
          });
        }, 1000);
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

    return () => {
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      endCall();
    };
  }, [contactId]);

  const toggleVideo = async () => {
    console.log("[TOGGLE] Starting video toggle");
    if (!localStreamRef.current) {
        console.error("[TOGGLE] No local stream available");
        return;
    }

    if (!isVideoOn) {
        // Turning video back on
        console.log("[TOGGLE] Requesting new video track");
        try {
            // Get a fresh video stream
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                }
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            if (!newVideoTrack) {
                throw new Error("No video track in new stream");
            }

            // Ensure track is enabled and active
            newVideoTrack.enabled = true;
            
            console.log("[TOGGLE] New video track obtained:", {
                id: newVideoTrack.id,
                enabled: newVideoTrack.enabled,
                readyState: newVideoTrack.readyState,
                settings: newVideoTrack.getSettings()
            });

            // Stop any existing video track
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStreamRef.current.removeTrack(oldTrack);
            }

            // Add new track to local stream
            localStreamRef.current.addTrack(newVideoTrack);

            // Update local video display
            if (localVideoRef.current) {
                const displayStream = new MediaStream([newVideoTrack]);
                localVideoRef.current.srcObject = displayStream;
                
                try {
                    await localVideoRef.current.play();
                    console.log("[TOGGLE] Local video playing");
                } catch (err) {
                    console.warn("[TOGGLE] Auto-play failed, will try on user interaction:", err);
                    const playOnClick = async () => {
                        try {
                            await localVideoRef.current.play();
                            document.removeEventListener('click', playOnClick);
                        } catch (playErr) {
                            console.error("[TOGGLE] Play failed even with user interaction:", playErr);
                        }
                    };
                    document.addEventListener('click', playOnClick);
                }
            }

            // Replace track in peer connection
            if (peerConnectionRef.current) {
                const senders = peerConnectionRef.current.getSenders();
                const videoSender = senders.find(sender => sender.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(newVideoTrack);
                    console.log("[TOGGLE] Track replaced in peer connection");
                } else {
                    console.log("[TOGGLE] No video sender found, adding new transceiver");
                    peerConnectionRef.current.addTransceiver(newVideoTrack, {
                        direction: 'sendrecv'
                    });
                }
            }

            setIsVideoOn(true);
            console.log("[TOGGLE] Video enabled successfully");

        } catch (err) {
            console.error("[TOGGLE] Error getting new video track:", err);
            toast.error("Failed to turn on camera");
            setIsVideoOn(false);
            return;
        }
    } else {
        // Turning video off
        console.log("[TOGGLE] Turning off video");
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            // Disable and stop the track
            videoTrack.enabled = false;
            videoTrack.stop();
            
            // Remove from local stream
            localStreamRef.current.removeTrack(videoTrack);
            
            // Clear local video display
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
            }
            
            // Update peer connection
            if (peerConnectionRef.current) {
                const senders = peerConnectionRef.current.getSenders();
                const videoSender = senders.find(sender => sender.track?.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(null);
                    console.log("[TOGGLE] Removed track from peer connection");
                }
            }
        }
        setIsVideoOn(false);
        console.log("[TOGGLE] Video disabled successfully");
    }
};

  // Add new function to handle local video setup
  const setupLocalVideo = async (stream) => {
    console.log("[LOCAL] Setting up local video");
    if (localVideoRef.current && stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        console.log("[LOCAL] Video track state:", {
          id: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          settings: videoTrack.getSettings()
        });

        // Create a new MediaStream just for this video element
        const localDisplayStream = new MediaStream([videoTrack]);
        localVideoRef.current.srcObject = localDisplayStream;

        try {
          await localVideoRef.current.play();
          console.log("[LOCAL] Video playing successfully");
        } catch (err) {
          console.error("[LOCAL] Error playing video:", err);
          // Try again with user interaction
          const playOnClick = async () => {
            try {
              await localVideoRef.current.play();
              console.log("[LOCAL] Video playing after user interaction");
            } catch (err) {
              console.error("[LOCAL] Failed to play even with user interaction:", err);
            }
          };
          document.addEventListener('click', playOnClick, { once: true });
        }
      }
    }
  };

  // Modify the useEffect for local video
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      setupLocalVideo(localStream);
    }
  }, [localStream]);

  // Modify the useEffect for remote video to create separate stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[REMOTE] Setting up remote video");
      const videoTrack = remoteStream.getVideoTracks()[0];
      const audioTrack = remoteStream.getAudioTracks()[0];

      if (videoTrack) {
        console.log("[REMOTE] Video track state:", {
          id: videoTrack.id,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          settings: videoTrack.getSettings()
        });
      }

      // Create a new MediaStream for the remote video
      const remoteDisplayStream = new MediaStream();
      if (videoTrack) remoteDisplayStream.addTrack(videoTrack);
      if (audioTrack) remoteDisplayStream.addTrack(audioTrack);

      const videoElement = remoteVideoRef.current;
      videoElement.srcObject = remoteDisplayStream;
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      videoElement.muted = false;

      videoElement.play()
        .then(() => console.log("[REMOTE] Playback started"))
        .catch(err => {
          console.error("[REMOTE] Playback failed:", err);
          // Try playing on user interaction
          const playOnClick = async () => {
            try {
              await videoElement.play();
              console.log("[REMOTE] Playback started after user interaction");
            } catch (err) {
              console.error("[REMOTE] Failed to play even with user interaction:", err);
            }
          };
          document.addEventListener('click', playOnClick, { once: true });
        });

      return () => {
        if (videoElement.srcObject) {
          const tracks = videoElement.srcObject.getTracks();
          tracks.forEach(track => track.stop());
          videoElement.srcObject = null;
        }
      };
    }
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