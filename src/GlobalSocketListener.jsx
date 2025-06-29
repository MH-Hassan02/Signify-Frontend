// GlobalSocketListener.jsx
import { useEffect } from "react";
import { useVideoCall } from "./contexts/VideoCallContext";
import socket from "./socket";

const GlobalSocketListener = () => {
  const { setIncomingCall } = useVideoCall();

  useEffect(() => {
    // Listen for incoming call event globally
    socket.on("incoming-call", ({ offer, from }) => {
      setIncomingCall({ offer, from });
      console.log("Global incoming call received");
      
      // Notify the sender that the receiver has received the call
      socket.emit("call-received", { to: from._id });
    });

    // Clean up the event listener when the component unmounts
    return () => {
      socket.off("incoming-call");
    };
  }, [setIncomingCall]);

  return null; // This component does not render anything
};

export default GlobalSocketListener;
