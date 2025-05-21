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
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    // Log all tracks we're adding to the connection
    stream.getTracks().forEach(track => {
      console.log(`[PEER] Adding ${track.kind} track to connection:`, {
        id: track.id,
        enabled: track.enabled,
        muted: track.muted
      });
      pc.addTrack(track, stream);
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
          // Ensure track is enabled
          event.track.enabled = true;
          
          console.log(`[RECEIVER] ${event.track.kind} track received:`, {
            id: event.track.id,
            enabled: event.track.enabled,
            readyState: event.track.readyState,
            settings: event.track.getSettings()
          });

          if (event.track.kind === 'video') {
            remoteStreamRef.current = stream;
            setRemoteStream(stream);
          }

          // Monitor track state
          event.track.onunmute = () => {
            console.log(`[RECEIVER] ${event.track.kind} track unmuted`);
            event.track.enabled = true;
          };
          
          event.track.onmute = () => {
            console.log(`[RECEIVER] ${event.track.kind} track muted`);
            // Don't disable the track when muted
          };

          event.track.onended = () => {
            console.log(`[RECEIVER] ${event.track.kind} track ended`);
          };
        }
      }
    };

    // Enhanced connection monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("[PEER] Connection state changed:", state);
      if (state === 'connected') {
        setIsConnected(true);
        // Log all senders and receivers when connected
        pc.getSenders().forEach(sender => {
          console.log('[PEER] Active sender:', {
            kind: sender.track?.kind,
            trackEnabled: sender.track?.enabled,
            trackMuted: sender.track?.muted
          });
        });
        pc.getReceivers().forEach(receiver => {
          console.log('[PEER] Active receiver:', {
            kind: receiver.track?.kind,
            trackEnabled: receiver.track?.enabled,
            trackMuted: receiver.track?.muted
          });
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[PEER] ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        // Double check media flow when ICE connects
        setTimeout(() => {
          if (pc.getReceivers) {
            pc.getReceivers().forEach(receiver => {
              if (receiver.track) {
                console.log(`[PEER] Receiver track state after ICE connected:`, {
                  kind: receiver.track.kind,
                  enabled: receiver.track.enabled,
                  muted: receiver.track.muted,
                  readyState: receiver.track.readyState
                });
              }
            });
          }
        }, 1000);
      }
    };

    // Monitor for negotiation needed
    pc.onnegotiationneeded = async () => {
      console.log("[PEER] Negotiation needed");
      try {
        if (pc.signalingState !== "stable") return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Note: You'll need to send this offer to the other peer
      } catch (err) {
        console.error("[PEER] Error during negotiation:", err);
      }
    };

    return pc;
  };

  const getLocalMedia = async () => {
    try {
      console.log("📹 Getting local media stream");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: true
      });
      
      // Enable all tracks explicitly
      stream.getTracks().forEach(track => {
        track.enabled = true;
        console.log(`Enabled local ${track.kind} track`);
      });
      
      console.log("Local stream obtained with tracks:", 
        stream.getTracks().map(t => `${t.kind}(enabled=${t.enabled})`).join(', '));
      
      // Store the stream in both ref and state
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set up local video
      if (localVideoRef.current) {
        console.log("Setting up local video element");
        localVideoRef.current.srcObject = stream;
        try {
          await localVideoRef.current.play();
          console.log("Local video playing immediately");
        } catch (err) {
          console.warn("Initial local video play failed:", err);
        }
      }
      
      return stream;
    } catch (err) {
      console.error("🚫 Media access error:", err);
      toast.error("Failed to access camera or microphone");
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

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Setting up local video element");
      
      const videoElement = localVideoRef.current;
      
      // Only set srcObject if it's not already set
      if (videoElement.srcObject !== localStream) {
        videoElement.srcObject = localStream;
      }
      
      const playVideo = async () => {
        try {
          await videoElement.play();
          console.log("Local video playing successfully");
        } catch (err) {
          if (err.name === 'AbortError') {
            console.log("Play interrupted, retrying...");
            setTimeout(playVideo, 100);
          } else {
            console.error("Failed to play local video:", err);
          }
        }
      };

      const handleMetadata = () => {
        console.log("Local video metadata loaded");
        playVideo();
      };

      videoElement.addEventListener('loadedmetadata', handleMetadata);

      return () => {
        videoElement.removeEventListener('loadedmetadata', handleMetadata);
        videoElement.srcObject = null;
      };
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("[REMOTE] Setting up remote stream:", {
        hasVideoTracks: remoteStream.getVideoTracks().length,
        hasAudioTracks: remoteStream.getAudioTracks().length,
        videoTrackStates: remoteStream.getVideoTracks().map(t => ({
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })),
        audioTrackStates: remoteStream.getAudioTracks().map(t => ({
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        }))
      });

      const videoElement = remoteVideoRef.current;

      // Ensure all tracks are enabled
      remoteStream.getTracks().forEach(track => {
        track.enabled = true;
        console.log(`[REMOTE] Enabled ${track.kind} track:`, {
          id: track.id,
          enabled: track.enabled,
          muted: track.muted
        });
      });

      // Configure video element
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      videoElement.muted = false; // Ensure audio is not muted

      // Set up event listeners
      const handleCanPlay = () => {
        console.log("[REMOTE] Video can play, attempting autoplay");
        videoElement.play()
          .then(() => {
            console.log("[REMOTE] Playback started successfully");
            // Double check audio state
            videoElement.muted = false;
          })
          .catch(err => {
            console.error("[REMOTE] Autoplay failed:", err);
            // Try playing on user interaction
            const playOnInteraction = () => {
              videoElement.play()
                .then(() => {
                  console.log("[REMOTE] Playback started after user interaction");
                  videoElement.muted = false;
                })
                .catch(console.error);
              document.removeEventListener('click', playOnInteraction);
            };
            document.addEventListener('click', playOnInteraction);
          });
      };

      const handleLoadedMetadata = () => {
        console.log("[REMOTE] Video metadata loaded:", {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          muted: videoElement.muted
        });
      };

      videoElement.addEventListener('canplay', handleCanPlay);
      videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

      // Set srcObject and force a play attempt
      videoElement.srcObject = remoteStream;
      videoElement.play().catch(err => {
        console.log("[REMOTE] Initial play failed, waiting for user interaction:", err);
      });

      return () => {
        videoElement.removeEventListener('canplay', handleCanPlay);
        videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
        if (videoElement.srcObject) {
          videoElement.srcObject = null;
        }
      };
    }
  }, [remoteStream]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
        console.log(`Microphone ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
        
        // If turning video back on, ensure it's displayed
        if (videoTrack.enabled && localVideoRef.current) {
          console.log("Refreshing local video display");
          const stream = localStreamRef.current;
          localVideoRef.current.srcObject = null;
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(console.error);
        }
        
        // Notify peer about video state
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders()
            .find(s => s.track?.kind === 'video');
          if (sender) {
            sender.track.enabled = videoTrack.enabled;
          }
        }
      }
    }
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