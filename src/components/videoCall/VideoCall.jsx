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
          "stun:stun1.l.google.com:19302"
        ]
      },
      {
        urls: [
          "turn:a.relay.metered.ca:80",
          "turn:a.relay.metered.ca:80?transport=tcp",
          "turn:a.relay.metered.ca:443",
          "turn:a.relay.metered.ca:443?transport=tcp",
        ],
        username: "e2c0e5ddc6c9ab8bc726db55",
        credential: "2D+rvHqfUe+9Yf/N"
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
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
      // Get the existing stream or create a new one
      const existingStream = videoElement.srcObject instanceof MediaStream ? 
        videoElement.srcObject : new MediaStream();
      
      // Remove any existing tracks of the same kind
      existingStream.getTracks().forEach(existingTrack => {
        if (existingTrack.kind === track.kind) {
          existingStream.removeTrack(existingTrack);
        }
      });
      
      // Add the new track
      existingStream.addTrack(track);
      
      // Configure video element
      videoElement.srcObject = existingStream;
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      
      // Only mute local video
      if (videoElement === localVideoRef.current) {
        videoElement.muted = true;
      }

      // Ensure track is enabled
      track.enabled = true;
      
      // Force a play attempt
      try {
        await videoElement.play();
        console.log(`[VIDEO] Successfully started playback for ${track.kind} track`);
      } catch (playError) {
        if (playError.name === 'NotAllowedError') {
          console.log('[VIDEO] Autoplay prevented, waiting for user interaction');
          const playPromise = () => {
            videoElement.play().catch(console.error);
            document.removeEventListener('click', playPromise);
          };
          document.addEventListener('click', playPromise);
        } else {
          throw playError;
        }
      }
      
      // Monitor track state
      track.onended = () => {
        console.log(`[VIDEO] Track ended: ${track.id}`);
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };
      
      track.onmute = () => {
        console.log(`[VIDEO] Track muted: ${track.id}`);
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };
      
      track.onunmute = () => {
        console.log(`[VIDEO] Track unmuted: ${track.id}`);
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(true);
        }
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
      track.enabled = true; // Always enable tracks
      console.log(`[PEER] Adding ${track.kind} track to connection:`, {
        id: track.id,
        enabled: track.enabled
      });
      pc.addTrack(track, stream);
    });

    // Handle incoming tracks
    pc.ontrack = async (event) => {
      let remoteStream = null;
      if (event.streams && event.streams[0]) {
        remoteStream = event.streams[0];
        console.log("[REMOTE] Track received (with stream):", {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted,
          streamTracks: remoteStream.getTracks().map(t => t.kind)
        });
      } else {
        // Fallback: build a MediaStream from the track
        remoteStream = remoteStreamRef.current || new window.MediaStream();
        remoteStream.addTrack(event.track);
        console.log("[REMOTE] Track received (no stream, fallback):", {
          kind: event.track.kind,
          enabled: event.track.enabled,
          readyState: event.track.readyState,
          muted: event.track.muted
        });
      }
      // Store and set remote stream
      remoteStreamRef.current = remoteStream;
      setRemoteStream(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.autoplay = true;
        try {
          await remoteVideoRef.current.play();
          console.log("[REMOTE] Media playback started");
        } catch (err) {
          console.error("[REMOTE] Failed to start media playback:", err);
          if (err.name === 'NotAllowedError') {
            const playPromise = () => {
              remoteVideoRef.current.play().catch(console.error);
              document.removeEventListener('click', playPromise);
            };
            document.addEventListener('click', playPromise);
          }
        }
      }
      // Track specific handlers
      if (event.track.kind === 'video') {
        event.track.enabled = true;
        console.log(`[REMOTE] Video track state: enabled=${event.track.enabled}, muted=${event.track.muted}`);
        event.track.onended = () => {
          console.log("[REMOTE] Video track ended");
          setIsRemoteVideoEnabled(false);
        };
        event.track.onmute = () => {
          console.log("[REMOTE] Video track muted");
          setIsRemoteVideoEnabled(false);
        };
        event.track.onunmute = () => {
          event.track.enabled = true;
          console.log("[REMOTE] Video track unmuted (forced enabled)");
          setIsRemoteVideoEnabled(true);
        };
      }
      if (event.track.kind === 'audio') {
        event.track.enabled = true;
        console.log(`[REMOTE] Audio track state: enabled=${event.track.enabled}, muted=${event.track.muted}`);
        event.track.onended = () => {
          console.log("[REMOTE] Audio track ended");
        };
        event.track.onmute = () => {
          console.log("[REMOTE] Audio track muted");
        };
        event.track.onunmute = () => {
          event.track.enabled = true;
          console.log("[REMOTE] Audio track unmuted (forced enabled)");
        };
      }
      event.track.enabled = true;
      console.log(`[REMOTE] Track final state: enabled=${event.track.enabled}, muted=${event.track.muted}`);
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
        track.enabled = true; // Always enable tracks
        console.log(`[MEDIA] Got ${track.kind} track:`, {
          id: track.id,
          enabled: track.enabled,
          readyState: track.readyState,
          settings: track.getSettings()
        });
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
    if (videoToggleLock.current) {
      console.log("[VIDEO] Toggle in progress, please wait");
      return;
    }

    try {
      videoToggleLock.current = true;
      console.log("[VIDEO] Toggling video");

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error("[VIDEO] No peer connection available");
        return;
      }

      // Get video sender
      const videoSender = pc.getSenders().find(sender => 
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) {
        console.error("[VIDEO] No video sender found");
        return;
      }

      const newState = !isVideoOn;
      setIsVideoOn(newState);

      // Get current video track
      const currentTrack = videoSender.track;
      if (currentTrack) {
        currentTrack.enabled = newState;
      }

      if (!newState) {
        // If turning video off, we don't need to replace the track
        console.log("[VIDEO] Video disabled");
      } else {
        try {
          // If turning video on, get a fresh video track
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = newStream.getVideoTracks()[0];
          
          await videoSender.replaceTrack(newVideoTrack);
          
          // Update local video display
          if (localVideoRef.current) {
            await setupVideoTrack(newVideoTrack, localVideoRef.current);
          }

          // Store the new track in localStream
          if (localStreamRef.current) {
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
              oldTrack.stop();
              localStreamRef.current.removeTrack(oldTrack);
            }
            localStreamRef.current.addTrack(newVideoTrack);
          }

          console.log("[VIDEO] Video enabled with new track");
        } catch (err) {
          console.error("[VIDEO] Failed to get new video track:", err);
          setIsVideoOn(false);
          toast.error("Failed to enable video");
        }
      }
    } catch (err) {
      console.error("[VIDEO] Toggle failed:", err);
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
      
      console.log("[RECEIVER] Setting remote description:", callData.offer);
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      
      // Process any queued ICE candidates
      while (iceCandidatesQueue.current.length) {
        const candidate = iceCandidatesQueue.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log("[ICE] Successfully added queued candidate");
        } catch (err) {
          console.error("[ICE] Failed to add candidate:", err);
        }
      }
      
      console.log("[RECEIVER] Creating answer");
      const answer = await pc.createAnswer();
      
      console.log("[RECEIVER] Setting local description");
      await pc.setLocalDescription(answer);
      
      // Ensure all local tracks are properly added and enabled
      stream.getTracks().forEach(track => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
        if (!sender) {
          console.log(`[RECEIVER] Adding ${track.kind} track to connection`);
          pc.addTrack(track, stream);
        }
        track.enabled = true;
      });
      
      console.log("[RECEIVER] Sending answer to caller");
      socket.emit("answer-call", {
        to: callData.from._id,
        answer: pc.localDescription
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
      console.log("[CALLER] Starting call with stream:", {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      
      const pc = await setupPeerConnection(stream);
      
      // Ensure all tracks are enabled
      stream.getTracks().forEach(track => {
        track.enabled = true;
        console.log(`[CALLER] Track ${track.kind} enabled:`, track.enabled);
      });
      
      // Wait for ICE gathering to begin
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log("[CALLER] Creating offer");
      const offer = await pc.createOffer();
      
      console.log("[CALLER] Setting local description");
      await pc.setLocalDescription(offer);
      
      // Verify tracks in peer connection
      pc.getSenders().forEach(sender => {
        if (sender.track) {
          console.log(`[CALLER] Sender track ${sender.track.kind}:`, {
            enabled: sender.track.enabled,
            readyState: sender.track.readyState
          });
        }
      });
      
      console.log("[CALLER] Sending offer to receiver");
      socket.emit("call-user", {
        to: contactId,
        offer: pc.localDescription,
        from: currentUser,
      });
    } catch (err) {
      console.error("[CALLER] Error starting call:", err);
      toast.error("Failed to start call");
      setIsCalling(false);
      endCall();
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