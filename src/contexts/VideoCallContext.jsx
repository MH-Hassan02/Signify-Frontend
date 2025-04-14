import React, { createContext, useContext, useState } from "react";

const VideoCallContext = createContext();

export const VideoCallProvider = ({ children }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [activeCall, setActiveCall] = useState(null);

  const value = {
    incomingCall,
    setIncomingCall,
    isCalling,
    setIsCalling,
    activeCall,
    setActiveCall,
  };

  return (
    <VideoCallContext.Provider value={value}>
      {children}
    </VideoCallContext.Provider>
  );
};

export const useVideoCall = () => useContext(VideoCallContext);
