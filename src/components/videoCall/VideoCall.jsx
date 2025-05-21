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

  // Refs for managing media elements and state
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const videoToggleLock = useRef(false);
  const hasInitiatedCall = useRef(false);
  const iceCandidatesQueue = useRef([]);
  const connectionStateRef = useRef('new');

  // State management
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);

  const { setIncomingCall, isCalling, setIsCalling } = useVideoCall();

  const servers = {
    iceServers: [
      { 
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302"
        ]
      },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp"
        ],
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceTransportPolicy: 'all'
  };

  // Helper function for setting up video tracks
  const setupVideoTrack = async (track, videoElement) => {
    if (!track || !videoElement) return;
    
    console.log(`[VIDEO] Setting up ${track.kind} track:`, {
      id: track.id,
      enabled: track.enabled,
      readyState: track.readyState
    });

    try {
      // Force enable the track
      track.enabled = true;
      
      // Create a new MediaStream with just this track
      const stream = new MediaStream([track]);
      
      // Configure video element
      videoElement.srcObject = stream;
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      
      // Only mute local video
      if (videoElement === localVideoRef.current) {
        videoElement.muted = true;
      }
      
      await videoElement.play();
      console.log(`[VIDEO] Successfully started playback for ${track.kind} track`);
      
      // Monitor track state
      track.onended = () => {
        console.log(`[VIDEO] Track ended: ${track.id}`);
      };
      
      track.onmute = () => {
        console.log(`[VIDEO] Track muted: ${track.id}`);
      };
      
      track.onunmute = () => {
        console.log(`[VIDEO] Track unmuted: ${track.id}`);
      };
      
    } catch (err) {
      console.error(`[VIDEO] Failed to setup ${track.kind} track:`, err);
      toast.error(`Failed to setup ${track.kind}`);
    }
  };

  // Enhanced peer connection setup
  const setupPeerConnection = async (stream) => {
    console.log("[PEER] Setting up new peer connection");
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    // Add all tracks to the peer connection
    stream.getTracks().forEach(track => {
      console.log(`[PEER] Adding ${track.kind} track to connection:`, {
        id: track.id,
        enabled: track.enabled
      });
      pc.addTrack(track, stream);
    });

    // Handle incoming tracks
    pc.ontrack = async (event) => {
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        console.log("[REMOTE] Track received:", {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted
        });
        
        // Force enable the track
        event.track.enabled = true;
        
        // Store the remote stream
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
        
        // Set up remote video display
        if (event.track.kind === 'video' && remoteVideoRef.current) {
          console.log("[REMOTE] Setting up video display");
          
          // Create a new MediaStream with just this track to ensure clean display
          const videoStream = new MediaStream([event.track]);
          remoteVideoRef.current.srcObject = videoStream;
          
          try {
            await remoteVideoRef.current.play();
            console.log("[REMOTE] Video playback started, track state:", {
              enabled: event.track.enabled,
              readyState: event.track.readyState
            });
          } catch (err) {
            console.error("[REMOTE] Failed to start video playback:", err);
          }
        }

        if (event.track.kind === 'video') {
          setIsRemoteVideoEnabled(event.track.enabled);
          
          event.track.onmute = () => {
            setIsRemoteVideoEnabled(false);
          };
          
          event.track.onunmute = () => {
            setIsRemoteVideoEnabled(true);
          };

          event.track.onended = () => {
            setIsRemoteVideoEnabled(false);
          };
        }
      }
    };

    // Monitor connection state changes
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("[PEER] Connection state changed:", state);
      connectionStateRef.current = state;
      
      if (state === 'connected') {
        setIsConnected(true);
        // Re-enable all tracks
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.enabled = true;
          }
        });
      } else if (state === 'failed' || state === 'disconnected') {
        console.log("[PEER] Attempting ICE restart");
        pc.restartIce();
        
        // Try to renegotiate
        if (state === 'failed') {
          renegotiateConnection(pc);
        }
      }
    };

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log("[ICE] Connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log("[ICE] Attempting restart");
        pc.restartIce();
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[ICE] New candidate:", event.candidate.type);
        socket.emit("ice-candidate", {
          to: contactId,
          candidate: event.candidate
        });
      }
    };

    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log("[ICE] Gathering state:", pc.iceGatheringState);
    };

    return pc;
  };

  // Add renegotiation helper
  const renegotiateConnection = async (pc) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true
      });
      
      await pc.setLocalDescription(offer);
      
      socket.emit("call-update", {
        to: contactId,
        offer: pc.localDescription
      });
    } catch (err) {
      console.error("[PEER] Renegotiation failed:", err);
    }
  };

  // Enhanced local media setup
  const getLocalMedia = async () => {
    try {
      console.log("[MEDIA] Requesting local media stream");
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("[MEDIA] Available devices:", devices);

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Log detailed track information
      stream.getTracks().forEach(track => {
        console.log(`[MEDIA] Got ${track.kind} track:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        });
        
        // Ensure tracks are enabled
        track.enabled = true;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Setup local video display
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        await setupVideoTrack(videoTrack, localVideoRef.current);
      }

      return stream;
    } catch (err) {
      console.error("[MEDIA] Error accessing media devices:", err);
      toast.error("Failed to access camera or microphone");
      throw err;
    }
  };

  // Modified video toggle
  const toggleVideo = async () => {
    if (videoToggleLock.current) return;
    
    try {
      videoToggleLock.current = true;
      console.log("[VIDEO] Current state:", isVideoOn ? "OFF" : "ON");

      if (!isVideoOn) {
        // Turning video on
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) throw new Error("No video track in new stream");

        // Update local display first
        if (localVideoRef.current) {
          const displayStream = new MediaStream([newVideoTrack]);
          localVideoRef.current.srcObject = displayStream;
          await localVideoRef.current.play().catch(console.error);
        }

        // Update peer connection
        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const videoSender = senders.find(s => s.track?.kind === 'video');
          
          if (videoSender) {
            try {
              await videoSender.replaceTrack(newVideoTrack);
              console.log("[VIDEO] Track replaced in peer connection");
              
              // Ensure the track is enabled
              newVideoTrack.enabled = true;
              
              // Update the local stream reference
              const oldTrack = localStreamRef.current?.getVideoTracks()[0];
              if (oldTrack) {
                oldTrack.stop();
                localStreamRef.current.removeTrack(oldTrack);
              }
              localStreamRef.current.addTrack(newVideoTrack);
              
              // Create a new offer to ensure proper negotiation
              const offer = await peerConnectionRef.current.createOffer();
              await peerConnectionRef.current.setLocalDescription(offer);
              
              socket.emit("call-update", {
                to: contactId,
                offer: offer
              });
            } catch (err) {
              console.error("[VIDEO] Failed to replace track:", err);
              // Fallback: Add as new track if replace fails
              peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
            }
          } else {
            peerConnectionRef.current.addTrack(newVideoTrack, localStreamRef.current);
          }
        }

        setIsVideoOn(true);
      } else {
        // Turning video off
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) {
          // Create black canvas stream for local display
          const blackCanvas = document.createElement('canvas');
          blackCanvas.width = 640;
          blackCanvas.height = 480;
          const ctx = blackCanvas.getContext('2d');
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, blackCanvas.width, blackCanvas.height);
          
          const blackStream = blackCanvas.captureStream();
          const blackTrack = blackStream.getVideoTracks()[0];

          // Update local display
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = blackStream;
          }

          // Update peer connection
          if (peerConnectionRef.current) {
            const senders = peerConnectionRef.current.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');
            
            if (videoSender) {
              try {
                await videoSender.replaceTrack(blackTrack);
                console.log("[VIDEO] Replaced with black track in peer connection");
                
                // Create a new offer
                const offer = await peerConnectionRef.current.createOffer();
                await peerConnectionRef.current.setLocalDescription(offer);
                
                socket.emit("call-update", {
                  to: contactId,
                  offer: offer
                });
              } catch (err) {
                console.error("[VIDEO] Failed to replace with black track:", err);
                videoTrack.enabled = false;
              }
            }
          }
        }
        setIsVideoOn(false);
      }
    } catch (err) {
      console.error("[VIDEO] Error:", err);
      toast.error("Failed to toggle video");
    } finally {
      videoToggleLock.current = false;
    }
  };

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

  // Call initialization
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
        const stream = await getLocalMedia();
        
        if (isIncomingCall && callData) {
          await handleIncomingCall(stream);
        } else if (!isIncomingCall) {
          await startCall(stream);
        }
      } catch (err) {
        console.error("[INIT] Call initialization failed:", err);
        endCall();
      }
    };

    initializeCall();
  }, []);

  // Modified handleIncomingCall
  const handleIncomingCall = async (stream) => {
    try {
      console.log("[RECEIVER] Starting incoming call flow");
      const pc = await setupPeerConnection(stream);
      
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      
      // Process any queued ICE candidates
      while (iceCandidatesQueue.current.length) {
        const candidate = iceCandidatesQueue.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
          .catch(err => console.error("[ICE] Failed to add candidate:", err));
      }
      
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(answer);
      
      socket.emit("answer-call", {
        to: callData.from._id,
        answer
      });
    } catch (err) {
      console.error("[RECEIVER] Error in incoming call flow:", err);
      toast.error("Failed to setup incoming call");
      endCall();
    }
  };

  // Modified startCall
  const startCall = async (stream) => {
    try {
      setIsCalling(true);
      
      const pc = await setupPeerConnection(stream);
      
      // Wait a bit for initial ICE gathering
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await pc.setLocalDescription(offer);
      
      socket.emit("call-user", {
        to: contactId,
        offer,
        from: currentUser,
      });
    } catch (err) {
      console.error("[CALLER] Error starting call:", err);
      toast.error("Failed to start call");
      setIsCalling(false);
    }
  };

  // Clean up call resources
  const endCall = () => {
    console.log("[END] Ending call");
    
    socket.emit("end-call", { to: contactId });

    // Clean up peer connection
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.error("[END] Error closing peer connection:", err);
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
        console.error("[END] Error stopping local tracks:", err);
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
        console.error("[END] Error stopping remote tracks:", err);
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
    setIsVideoReady(false);
    
    // Navigate away
    onClose?.();
    navigate("/calls", { replace: true });
  };

  // Socket event handlers
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
        if (peerConnectionRef.current) {
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
            console.log("[ICE] Candidate added successfully");
          } else {
            console.log("[ICE] Queueing candidate");
            iceCandidatesQueue.current.push(candidate);
          }
        }
      } catch (err) {
        console.error("[ICE] Error handling candidate:", err);
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
          answer: answer
        });
      } catch (err) {
        console.error("[UPDATE] Error handling call update:", err);
      }
    });

    socket.on("call-update-answer", async ({ answer }) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        console.log("[UPDATE] Successfully updated remote description");
      } catch (err) {
        console.error("[UPDATE] Error setting remote description:", err);
      }
    });

    return () => {
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      socket.off("call-update");
      socket.off("call-update-answer");
      endCall();
    };
  }, [contactId]);

  // Enhanced connection state monitoring
  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const handleConnectionStateChange = () => {
      console.log("[CONN] Connection state:", pc.connectionState);
      if (pc.connectionState === 'failed') {
        // Attempt recovery
        try {
          pc.restartIce();
          const senders = pc.getSenders();
          senders.forEach(async sender => {
            if (sender.track) {
              sender.track.enabled = true;
              if (sender.track.kind === 'video' && !isVideoOn) {
                sender.track.enabled = false;
              }
            }
          });
        } catch (err) {
          console.error("[CONN] Recovery failed:", err);
        }
      }
    };

    pc.addEventListener('connectionstatechange', handleConnectionStateChange);
    return () => pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
  }, [isVideoOn]);

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
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          <p className="contactNameVideo">
            {currentUser?.username} {!isMicOn && <FaMicrophoneSlash />}
          </p>
        </div>

        <div className="videoSlot">
          {(!remoteStream || !isRemoteVideoEnabled) ? (
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