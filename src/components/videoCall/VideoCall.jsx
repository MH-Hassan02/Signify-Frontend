import React, { useState, useEffect, useRef } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaPhoneSlash,
  FaPhone,
  FaCheck,
  FaHandPaper,
} from "react-icons/fa";
import { toast } from "react-toastify";
import socket from "../../socket";
import "./VideoCall.css";
import { useVideoCall } from "../../contexts/VideoCallContext";
import { useNavigate, useLocation } from "react-router-dom";
import SignLanguageTranslator from "../signLanguage/SignLanguageTranslator";

const VideoCall = ({
  currentUser,
  contactId,
  contactProfilePic,
  contactUsername,
  onClose,
}) => {
  console.log("HASEEB KA PROJECT");
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
  const connectionStateRef = useRef("new");

  // State management
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);
  const [isRemoteMicEnabled, setIsRemoteMicEnabled] = useState(true);
  const [callStatus, setCallStatus] = useState(""); // calling, ringing, connected

  // Sign Language Translation State
  const [isSignLanguageActive, setIsSignLanguageActive] = useState(false);
  const [isPeerSignLanguageActive, setIsPeerSignLanguageActive] = useState(false);
  const [localGesture, setLocalGesture] = useState("No Hand Detected");
  const [peerGesture, setPeerGesture] = useState("No Hand Detected");
  const [transcript, setTranscript] = useState("");
  const [peerTranscript, setPeerTranscript] = useState("");

  const { setIncomingCall, isCalling, setIsCalling } = useVideoCall();

  // Optimized ICE servers for faster connection
  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp",
        ],
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 5, // Reduced for faster gathering
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  };

  // Helper function for setting up video tracks
  const setupVideoTrack = async (track, videoElement) => {
    if (!track || !videoElement) return;

    try {
      // Get the existing stream or create a new one
      const existingStream =
        videoElement.srcObject instanceof MediaStream
          ? videoElement.srcObject
          : new MediaStream();

      // Remove any existing tracks of the same kind
      existingStream.getTracks().forEach((existingTrack) => {
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
      } catch (playError) {
        if (playError.name === "NotAllowedError") {
          const playPromise = () => {
            videoElement.play().catch(console.error);
            document.removeEventListener("click", playPromise);
          };
          document.addEventListener("click", playPromise);
        } else {
          throw playError;
        }
      }

      // Monitor track state
      track.onended = () => {
        if (track.kind === "video" && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };

      track.onmute = () => {
        if (track.kind === "video" && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };

      track.onunmute = () => {
        if (track.kind === "video" && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(true);
        }
      };
    } catch (err) {
      console.error(`Failed to setup ${track.kind} track:`, err);
      toast.error(`Failed to setup ${track.kind}`);
    }
  };

  // Enhanced peer connection setup
  const setupPeerConnection = async (stream) => {
    console.log("Setting up peer connection");
    const pc = new RTCPeerConnection(servers); // Use the optimized servers configuration
    peerConnectionRef.current = pc;

    // Add all tracks to the peer connection
    stream.getTracks().forEach((track) => {
      console.log(`Adding ${track.kind} track to peer connection`);
      track.enabled = true;
      pc.addTrack(track, stream);
      console.log(`${track.kind} track added successfully`);
    });

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log("🚦 Received track:", event.track.kind, event.track);

      if (event.streams && event.streams[0]) {
        console.log("✅ Using existing remote stream:", event.streams[0]);
        const remoteStream = event.streams[0];

        console.log("🎥 Remote stream tracks:", remoteStream.getTracks());

        remoteStreamRef.current = remoteStream;
        setRemoteStream(remoteStream);

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          console.log(
            "🎯 Set remoteVideoRef.srcObject to:",
            remoteVideoRef.current.srcObject
          );

          remoteVideoRef.current.playsInline = true;
          remoteVideoRef.current.autoplay = true;

          console.log(
            "🔎 Remote video element state:",
            "paused:",
            remoteVideoRef.current.paused,
            "readyState:",
            remoteVideoRef.current.readyState
          );

          // Attempt to play the video, catch errors
          remoteVideoRef.current
            .play()
            .then(() => {
              console.log("🚀 Remote video started playing successfully");
            })
            .catch((err) => {
              console.error("❌ Error playing remote video:", err);
            });

          // Ensure track is enabled
          event.track.enabled = true;
          console.log("🔔 Remote track enabled:", event.track.enabled);

          // Monitor track state
          event.track.onended = () => {
            console.warn(`🛑 ${event.track.kind} track ended`);
            if (event.track.kind === "video") {
              setIsRemoteVideoEnabled(false);
            } else if (event.track.kind === "audio") {
              setIsRemoteMicEnabled(false);
            }
          };

          event.track.onmute = () => {
            console.warn(`🔇 ${event.track.kind} track muted`);
            if (event.track.kind === "video") {
              setIsRemoteVideoEnabled(false);
            } else if (event.track.kind === "audio") {
              setIsRemoteMicEnabled(false);
            }
          };

          event.track.onunmute = () => {
            console.log(`🔊 ${event.track.kind} track unmuted`);
            event.track.enabled = true;
            if (event.track.kind === "video") {
              setIsRemoteVideoEnabled(true);
            } else if (event.track.kind === "audio") {
              setIsRemoteMicEnabled(true);
            }
          };
        } else {
          console.error(
            "❌ remoteVideoRef.current is null when trying to attach remote stream"
          );
        }
      } else {
        console.error("❌ No remote streams found in ontrack event:", event);
      }
    };

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(
        "[PeerConnection] Connection state changed:",
        pc.connectionState
      );

      connectionStateRef.current = state;

      if (state === "connected") {
        setIsConnected(true);
        setCallStatus("connected"); // Update status to connected
        // Ensure all tracks are enabled when connected
        pc.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.track.enabled = true;
          }
        });
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track) {
            receiver.track.enabled = true;
          }
        });
      } else if (state === "failed" || state === "disconnected") {
        console.log("Connection failed or disconnected, attempting recovery");
        pc.restartIce();
      }
    };

    // ICE connection monitoring
    pc.oniceconnectionstatechange = () => {
      console.log(
        "[PeerConnection] ICE connection state changed:",
        pc.iceConnectionState
      );

      if (pc.iceConnectionState === "failed") {
        console.log("ICE connection failed, restarting ICE");
        pc.restartIce();
      }
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(
          "[PeerConnection] Emitting ICE candidate:",
          event.candidate
        );
        socket.emit("ice-candidate", {
          to: contactId,
          candidate: event.candidate,
        });
      } else {
        console.log("[PeerConnection] ICE gathering complete (null candidate)");
      }
    };

    return pc;
  };

  // Add renegotiation helper
  const renegotiateConnection = async (pc) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true,
      });

      await pc.setLocalDescription(offer);

      socket.emit("call-update", {
        to: contactId,
        offer: pc.localDescription,
      });
    } catch (err) {
      console.error("Renegotiation failed:", err);
    }
  };

  const waitForIceGatheringComplete = (pc) =>
    new Promise((resolve, reject) => {
      // Add timeout to prevent indefinite waiting
      const timeout = setTimeout(() => {
        console.warn("ICE gathering timeout, proceeding anyway");
        resolve();
      }, 5000); // 5 second timeout instead of waiting indefinitely

      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(timeout);
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", checkState);
      }
    });

  // Enhanced local media setup - optimized for speed
  const getLocalMedia = async () => {
    try {
      // Get both video and audio simultaneously for faster setup
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Media stream obtained:", stream.getTracks().map(t => t.kind));

      // Ensure all tracks are enabled
      stream.getTracks().forEach((track) => {
        console.log(`Ensuring ${track.kind} track is enabled`);
        track.enabled = true;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Set up local video immediately
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;

        // Try to play immediately
        try {
          await localVideoRef.current.play();
          console.log("Local video playing successfully");
        } catch (err) {
          console.warn("Auto-play failed, will play on user interaction:", err);
        }
      }

      return stream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      
      // Fallback: try video only if audio fails
      try {
        console.log("Trying video-only fallback");
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        
        localStreamRef.current = videoStream;
        setLocalStream(videoStream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = videoStream;
          localVideoRef.current.muted = true;
          localVideoRef.current.playsInline = true;
          localVideoRef.current.autoplay = true;
        }
        
        return videoStream;
      } catch (fallbackErr) {
        console.error("Fallback also failed:", fallbackErr);
        toast.error("Failed to access camera or microphone");
        throw fallbackErr;
      }
    }
  };

  // Modified video toggle
  const toggleVideo = async () => {
    if (videoToggleLock.current) return;

    try {
      videoToggleLock.current = true;
      const pc = peerConnectionRef.current;
      if (!pc) return;

      const videoSender = pc
        .getSenders()
        .find((sender) => sender.track && sender.track.kind === "video");

      if (!videoSender) return;

      const newState = !isVideoOn;
      setIsVideoOn(newState);

      const currentTrack = videoSender.track;
      if (currentTrack) {
        currentTrack.enabled = newState;
      }

      if (!newState) {
        // If turning video off, we don't need to replace the track
      } else {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const newVideoTrack = newStream.getVideoTracks()[0];

          await videoSender.replaceTrack(newVideoTrack);

          if (localVideoRef.current) {
            await setupVideoTrack(newVideoTrack, localVideoRef.current);
          }

          if (localStreamRef.current) {
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
              oldTrack.stop();
              localStreamRef.current.removeTrack(oldTrack);
            }
            localStreamRef.current.addTrack(newVideoTrack);
          }
        } catch (err) {
          console.error("Failed to get new video track:", err);
          setIsVideoOn(false);
          toast.error("Failed to enable video");
        }
      }
    } catch (err) {
      console.error("Toggle failed:", err);
      toast.error("Failed to toggle video");
    } finally {
      videoToggleLock.current = false;
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);

        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const audioSender = senders.find(
            (sender) => sender.track?.kind === "audio"
          );
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = audioTrack.enabled;
          }
        }
      }
    }
  };

  // Sign Language Translation Functions
  const toggleSignLanguage = () => {
    const newStatus = !isSignLanguageActive;
    setIsSignLanguageActive(newStatus);
    
    // Emit socket event to inform peer about sign language status
    if (isConnected) {
      socket.emit("sign-language-toggle", {
        to: contactId,
        isActive: newStatus,
        from: currentUser._id
      });
    }
    
    if (newStatus) {
      toast.success("Sign language detection activated!");
    } else {
      toast.info("Sign language detection deactivated");
    }
  };

  const handleGestureDetected = (gesture) => {
    setLocalGesture(gesture);
    
    // Share gesture with peer
    if (isConnected && gesture !== "No Hand Detected" && gesture !== "Error") {
      socket.emit("gesture-detected", {
        to: contactId,
        gesture: gesture,
        from: currentUser._id
      });
    }
  };

  const handleTranscriptUpdate = (newTranscript) => {
    setTranscript(newTranscript);
    
    // Share transcript with peer only if it's not empty
    if (isConnected && newTranscript && newTranscript.trim()) {
      socket.emit("transcript-update", {
        to: contactId,
        transcript: newTranscript,
        from: currentUser._id
      });
    }
  };

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("🔗 Attaching remoteStream to video element in useEffect");
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current
        .play()
        .then(() => console.log("🚀 Remote video playing successfully"))
        .catch((err) => console.error("❌ Error playing remote video:", err));
    }
  }, [remoteStream]);

  // Call initialization
  useEffect(() => {
    console.log("VideoCall mounted:", {
      currentUser,
      contactId,
      isIncomingCall,
      callData,
    });

    const initializeCall = async () => {
      if (hasInitiatedCall.current) return;
      hasInitiatedCall.current = true;

      try {
        const stream = await getLocalMedia();

        if (isIncomingCall && callData) {
          await handleIncomingCall(stream);
        } else if (!isIncomingCall) {
          await startCall(stream);
        }
      } catch (err) {
        console.error("Call initialization failed:", err);
        endCall();
      }
    };

    initializeCall();
  }, []);

  // Modified handleIncomingCall
  const handleIncomingCall = async (stream) => {
    try {
      setCallStatus("connecting"); // Changed from "ringing" to "connecting" for receiver
      
      // ✅ Setup peer connection and add local tracks inside setupPeerConnection
      const pc = await setupPeerConnection(stream);

      // ✅ Set the remote offer as the peer connection's remote description
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      console.log(
        "[IncomingCall] Remote description set from offer:",
        callData.offer
      );

      // ✅ Process any ICE candidates that arrived before the remote description was set
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log("✅ Added queued ICE candidate:", candidate);
        } catch (err) {
          console.error("❌ Failed to add queued ICE candidate:", err);
        }
      }

      // ✅ Create and send an answer to the caller
      const answer = await pc.createAnswer();
      console.log("[IncomingCall] Created answer:", answer);
      await pc.setLocalDescription(answer);
      console.log(
        "[IncomingCall] Local description set with answer:",
        pc.localDescription
      );

      // ✅ Wait for ICE gathering to complete before sending answer
      await waitForIceGatheringComplete(pc);

      console.log(
        "[IncomingCall] Emitting answer-call with:",
        pc.localDescription
      );
      socket.emit("answer-call", {
        to: callData.from._id,
        answer: pc.localDescription,
      });

      // ✅ Ensure all local tracks are enabled
      stream.getTracks().forEach((track) => {
        track.enabled = true;
      });
    } catch (err) {
      console.error("❌ Error in incoming call flow:", err);
      toast.error("Failed to set up incoming call");
      setCallStatus(""); // Reset status on error
      endCall();
    }
  };

  // Modified startCall
  const startCall = async (stream) => {
    try {
      console.log("[StartCall] Starting call setup");
      setIsCalling(true);
      setCallStatus("calling"); // Set status to calling

      const pc = await setupPeerConnection(stream);
      peerConnectionRef.current = pc;

      const offer = await pc.createOffer();
      console.log("[StartCall] Created offer:", offer);
      await pc.setLocalDescription(offer);
      console.log(
        "[StartCall] Local description set with offer:",
        pc.localDescription
      );

      await waitForIceGatheringComplete(pc);
      console.log(
        "[StartCall] Emitting call-user with offer:",
        pc.localDescription
      );

      socket.emit("call-user", {
        to: contactId,
        offer: pc.localDescription,
        from: currentUser,
      });
    } catch (err) {
      console.error("Error starting call:", err);
      toast.error("Failed to start call");
      setIsCalling(false);
      setCallStatus(""); // Reset status on error
      endCall();
    }
  };

  // Clean up call resources
  const endCall = () => {
    socket.emit("end-call", { to: contactId });

    // Reset sign language states
    setIsSignLanguageActive(false);
    setIsPeerSignLanguageActive(false);
    setLocalGesture("No Hand Detected");
    setPeerGesture("No Hand Detected");
    setTranscript("");
    setPeerTranscript("");

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.error("Error closing peer connection:", err);
      }
      peerConnectionRef.current = null;
    }

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

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setIncomingCall(null);
    setIsConnected(false);
    setIsVideoReady(false);
    setCallStatus(""); // Reset call status

    onClose?.();
    navigate("/calls", { replace: true });
  };

  // Socket event handlers
  useEffect(() => {
    console.log("Setting up socket event listeners for video call");

    // Listen for call-received event to update sender's status - set up immediately
    socket.on("call-received", () => {
      console.log("[Socket] Call received by receiver, updating status to ringing");
      console.log("[Socket] Current call status:", callStatus);
      if (callStatus === "calling") {
        console.log("[Socket] Changing status from calling to ringing");
        setCallStatus("ringing");
      } else {
        console.log("[Socket] Not changing status, current status is:", callStatus);
      }
    });

    socket.on("call-accepted", async ({ answer }) => {
      console.log("[Socket] Received call-accepted with answer:", answer);

      // Update sender's status from "calling" to "ringing" when receiver accepts
      if (callStatus === "calling") {
        setCallStatus("ringing");
      }

      try {
        if (peerConnectionRef.current && answer) {
          console.log("Setting remote description from answer");
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          console.log("Remote description set successfully");

          // Process queued ICE candidates AFTER setting remote description
          while (iceCandidatesQueue.current.length > 0) {
            const candidate = iceCandidatesQueue.current.shift();
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
              console.log("Added queued ICE candidate:", candidate);
            } catch (err) {
              console.error("Failed to add queued ICE candidate:", err);
            }
          }
        } else {
          console.error("No peer connection or answer available");
        }
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    socket.on("call-ended", () => {
      console.log("[Socket] Received call-ended signal");
      toast.info("Call ended");
      endCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      console.log("[Socket] Received ICE candidate:", candidate);

      try {
        if (peerConnectionRef.current) {
          if (peerConnectionRef.current.remoteDescription) {
            console.log("Adding ICE candidate");
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
            console.log("ICE candidate added successfully");
          } else {
            console.log("Queueing ICE candidate - no remote description yet");
            iceCandidatesQueue.current.push(candidate);
          }
        } else {
          console.error("No peer connection available for ICE candidate");
        }
      } catch (err) {
        console.error("Error handling ICE candidate:", err);
      }
    });

    socket.on("call-update", async ({ offer }) => {
      console.log("[Socket] Received call-update with offer:", offer);

      if (!peerConnectionRef.current) return;

      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(offer)
        );
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);

        socket.emit("call-update-answer", {
          to: contactId,
          answer: answer,
        });
      } catch (err) {
        console.error("Error handling call update:", err);
      }
    });

    socket.on("call-update-answer", async ({ answer }) => {
      console.log("[Socket] Received call-update-answer with answer:", answer);

      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    // Sign Language Translation Socket Events
    socket.on("sign-language-toggle", ({ isActive, from }) => {
      console.log("[Socket] Received sign language toggle from peer:", isActive, "from:", from);
      if (from === contactId) {
        setIsPeerSignLanguageActive(isActive);
        if (isActive) {
          toast.info(`${contactUsername} has enabled sign language detection`);
        } else {
          toast.info(`${contactUsername} has disabled sign language detection`);
        }
      }
    });

    socket.on("gesture-detected", ({ gesture, from }) => {
      console.log("[Socket] Received gesture from peer:", gesture, "from:", from);
      if (from === contactId) {
        setPeerGesture(gesture);
      }
    });

    socket.on("transcript-update", ({ transcript, from }) => {
      console.log("[Socket] Received transcript update from peer:", transcript, "from:", from);
      if (from === contactId) {
        setPeerTranscript(transcript);
      }
    });

    return () => {
      console.log("Cleaning up socket event listeners");
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      socket.off("call-update");
      socket.off("call-update-answer");
      socket.off("call-received");
      socket.off("sign-language-toggle");
      socket.off("gesture-detected");
      socket.off("transcript-update");
      endCall();
    };
  }, [contactId]);

  // Enhanced connection state monitoring
  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const handleConnectionStateChange = () => {
      if (pc.connectionState === "failed") {
        try {
          pc.restartIce();
          const senders = pc.getSenders();
          senders.forEach(async (sender) => {
            if (sender.track) {
              sender.track.enabled = true;
              if (sender.track.kind === "video" && !isVideoOn) {
                sender.track.enabled = false;
              }
            }
          });
        } catch (err) {
          console.error("Recovery failed:", err);
        }
      }
    };

    pc.addEventListener("connectionstatechange", handleConnectionStateChange);
    return () =>
      pc.removeEventListener(
        "connectionstatechange",
        handleConnectionStateChange
      );
  }, [isVideoOn]);

  // Debug call status changes
  useEffect(() => {
    console.log("🔄 Call status changed to:", callStatus);
  }, [callStatus]);

  // Initialize handpose model

  return (
    <div className="videoCallWrapper">
      {/* WhatsApp-style status indicator */}
      {callStatus && (
        <div className={`callStatus ${callStatus}`}>
          {callStatus === "calling" && (
            <>
              <FaPhone className="statusIcon" />
              Calling...
            </>
          )}
          {callStatus === "ringing" && (
            <>
              <FaPhone className="statusIcon ringing" />
              Ringing...
            </>
          )}
          {callStatus === "connecting" && (
            <>
              <FaPhone className="statusIcon" />
              Connecting...
            </>
          )}
          {callStatus === "connected" && (
            <>
              <FaCheck className="statusIcon" />
              Connected
            </>
          )}
        </div>
      )}

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
              style={{ transform: "scaleX(-1)" }}
            />
          )}
          <p className="contactNameVideo">
            {currentUser?.username} {!isMicOn && <FaMicrophoneSlash />}
          </p>
        </div>

        <div className="videoSlot">
          <video
            className="videoCallVideo remote"
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              display: remoteStream && isRemoteVideoEnabled ? "block" : "none",
            }}
          />
          {(!remoteStream || !isRemoteVideoEnabled) && (
            <img
              src={contactProfilePic}
              alt={contactUsername}
              className="videoCallVideo"
            />
          )}
          <p className="contactNameVideo">
            {contactUsername}
            <span className="statusIcons">
              {!isRemoteMicEnabled && <FaMicrophoneSlash />}
              {!isRemoteVideoEnabled && <FaVideoSlash />}
            </span>
          </p>
        </div>
      </div>

      <div className="videoControls">
        <button onClick={toggleMic}>
          {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOn ? <FaVideo /> : <FaVideoSlash />}
        </button>
        <button 
          onClick={toggleSignLanguage}
          className={isSignLanguageActive ? "signLanguageActive" : ""}
          title="Toggle Sign Language Translation"
        >
          <FaHandPaper />
        </button>
        <button onClick={endCall} className="endCallBtn">
          <FaPhoneSlash />
        </button>
      </div>

      {/* Sign Language Translator */}
      {(isSignLanguageActive || isPeerSignLanguageActive) && (
        <SignLanguageTranslator
          videoRef={localVideoRef}
          isActive={isSignLanguageActive && isConnected}
          onGestureDetected={handleGestureDetected}
          onTranscriptUpdate={handleTranscriptUpdate}
          peerGesture={peerGesture}
          peerTranscript={peerTranscript}
          isPeerActive={isPeerSignLanguageActive}
          isLocalActive={isSignLanguageActive}
          contactUsername={contactUsername}
        />
      )}
    </div>
  );
};

export default VideoCall;
