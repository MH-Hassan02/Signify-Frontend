import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import moment from "moment";
import { FaVideo, FaSearch, FaArrowDown } from "react-icons/fa";
import { MdSend } from "react-icons/md";
import { AiOutlineArrowLeft } from "react-icons/ai";
import { toast } from "react-toastify";
import ChatPlaceholder from "./ChatPlaceholder";
import socket from "../../socket";
import { useVideoCall } from "../../contexts/VideoCallContext";
import IncomingCallPopup from "./IncomingCallPopup";
import ChatMessagesSkeleton from "./ChatMessagesSkeleton";
import "./Chat.css";

const Chat = ({ selectedContact, onVideoCall, onBack, mobileMode }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const chatMessagesRef = useRef(null);
  const messagesEndRef = useRef(null);
  const prevMessagesLength = useRef(0);
  const currentUser = useSelector((state) => state.user.userInfo);
  const { incomingCall, setIncomingCall, isCalling } = useVideoCall();

  useEffect(() => {
    if (currentUser && currentUser._id) {
      socket.emit("setup", currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedContact && currentUser && currentUser._id) {
        console.log("🔄 Fetching messages for:", selectedContact.username);
        setLoading(true);
        setMessages([]); // Clear previous messages immediately
        
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_BASE_URL}/messages/${currentUser._id}/${
              selectedContact._id
            }`,
            { withCredentials: true }
          );
          
          console.log("📨 Messages response:", res.data);
          console.log("📨 Messages length:", res.data ? res.data.length : 0);
          
          // Only show toast if there are actually no messages
          if (!res.data || res.data.length === 0) {
            console.log("📭 No messages found, showing toast");
            toast.info("No Messages Yet");
            setMessages([]);
          } else {
            console.log("✅ Setting messages:", res.data.length, "messages");
            setMessages(res.data);
          }
          
          setIsInitialLoad(true);

          // Mark messages as read only if there are messages
          if (res.data && res.data.length > 0) {
            await axios.put(
              `${import.meta.env.VITE_BASE_URL}/messages/markAsRead`,
              { senderId: selectedContact._id, receiverId: currentUser._id },
              { withCredentials: true }
            );
          }
        } catch (error) {
          console.error("❌ Error fetching messages:", error);
          // Only show toast for actual errors, not for empty messages
          if (error.response && error.response.status !== 404) {
            toast.error("Error loading messages");
          } else {
            toast.info("No Messages Yet");
          }
          setMessages([]);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchMessages();
  }, [selectedContact, currentUser]);

  useEffect(() => {
    if (!selectedContact) return;

    const handleMessageReceived = (newMsg) => {
      if (
        newMsg.sender._id === selectedContact._id ||
        newMsg.receiver === selectedContact._id
      ) {
        setMessages((prev) => [...prev, newMsg]);
      }
    };

    socket.on("message received", handleMessageReceived);

    return () => {
      socket.off("message received", handleMessageReceived);
    };
  }, [selectedContact]);

  useEffect(() => {
    if (!selectedContact) return;

    const handleTyping = ({ from }) => {
      if (from === selectedContact._id) {
        console.log("Typing bubble active");
        setSomeoneTyping(true);
      }
    };

    const handleStopTyping = ({ from }) => {
      if (from === selectedContact._id) {
        console.log("Typing bubble stopping");
        setSomeoneTyping(false);
      }
    };

    socket.on("typing", handleTyping);
    socket.on("stop typing", handleStopTyping);

    return () => {
      socket.off("typing", handleTyping);
      socket.off("stop typing", handleStopTyping);
    };
  }, [selectedContact]);

  useEffect(() => {
    if (input.trim()) {
      setIsTyping(true);
      socket.emit("typing", {
        from: currentUser._id,
        to: selectedContact?._id,
      });
    } else {
      setIsTyping(false);
      if (selectedContact) {
        socket.emit("stop typing", {
          from: currentUser._id,
          to: selectedContact?._id,
        });
      }
    }
  }, [input]);

  // Handle scroll behavior and auto-scroll
  useEffect(() => {
    const chatContainer = chatMessagesRef.current;
    if (!chatContainer) return;

    const handleScroll = () => {
      const isAtBottom =
        Math.abs(
          chatContainer.scrollHeight -
          chatContainer.scrollTop -
          chatContainer.clientHeight
        ) < 10;

      setShowScrollToBottom(!isAtBottom);
    };

    // Auto scroll in two cases:
    // 1. Initial load
    // 2. New message arrives while at bottom
    if (messages.length > prevMessagesLength.current && isInitialLoad) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        setIsInitialLoad(false);
      });
    } else if (messages.length > prevMessagesLength.current && !showScrollToBottom) {
      // If we're already at bottom when new message arrives
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    
    prevMessagesLength.current = messages.length;

    chatContainer.addEventListener("scroll", handleScroll);
    return () => chatContainer.removeEventListener("scroll", handleScroll);
  }, [messages, isInitialLoad]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollToBottom(false);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/chats`,
        {
          userId: currentUser._id,
          secondUserId: selectedContact._id,
        },
        { withCredentials: true }
      );

      const chatId = res.data._id;

      const newMsg = {
        text: input,
        sender: { _id: currentUser._id },
        receiver: selectedContact._id,
        chatId: chatId,
        time: new Date().toLocaleTimeString(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, newMsg]);
      setInput("");

      await axios.post(`${import.meta.env.VITE_BASE_URL}/messages`, newMsg, {
        withCredentials: true,
      });

      socket.emit("new message", newMsg);
      socket.emit("stop typing", {
        from: currentUser._id,
        to: selectedContact._id,
      });
    } catch (err) {
      toast.error("Error sending message");
    }
  };

  useEffect(() => {
    const markAsRead = async () => {
      if (selectedContact) {
        try {
          await axios.put(
            `${import.meta.env.VITE_BASE_URL}/messages/markAsRead`,
            { senderId: selectedContact._id, receiverId: currentUser._id },
            { withCredentials: true }
          );
        } catch (error) {
          toast.error("Error Reading messages");
        }
      }
    };

    markAsRead();
  }, [messages, someoneTyping]);

  function formatMessageTime(date) {
    const m = moment(date);
    if (m.isSame(moment(), 'day')) {
      return `Today, ${m.format('hh:mm A')}`;
    } else if (m.isSame(moment().subtract(1, 'day'), 'day')) {
      return `Yesterday, ${m.format('hh:mm A')}`;
    } else {
      return m.format('D MMM, YYYY, hh:mm A');
    }
  }

  return (
    <div className="chatMain">
      {selectedContact ? (
        <>
          <div className="chatHeader">
            <div className="headerLeft">
              {mobileMode && (
                <AiOutlineArrowLeft
                  size={22}
                  onClick={onBack}
                  style={{ cursor: "pointer" }}
                />
              )}
              <img
                src={selectedContact.profilePic}
                alt="Profile"
                className="profilePic"
              />
              <span className="contactName">{selectedContact.username}</span>
            </div>
            <div className="headerRight">
              <FaVideo
                className="videoCallIcon"
                onClick={() => onVideoCall(selectedContact)}
              />
              <FaSearch className="searchIcon" />
            </div>
          </div>

          <div className="chatMessages" ref={chatMessagesRef}>
            {loading ? (
              <ChatMessagesSkeleton />
            ) : (
              <>
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`chatBubble ${
                      msg.sender._id === currentUser._id ? "me" : "them"
                    }`}
                  >
                    <div>{msg.text}</div>
                    <div className="messageTime">
                      {formatMessageTime(msg.createdAt)}
                    </div>
                  </div>
                ))}

                {someoneTyping && (
                  <div className="chatBubble them typing">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {showScrollToBottom && (
            <button 
              className="scrollToBottomBtn" 
              onClick={scrollToBottom}
            >
              <FaArrowDown />
            </button>
          )}

          <div className="chatInputArea">
            <input
              type="text"
              placeholder="Type a message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>
              <MdSend size={20} />
            </button>
          </div>

          {incomingCall && !isCalling && <IncomingCallPopup />}
        </>
      ) : (
        <ChatPlaceholder />
      )}
    </div>
  );
};

export default Chat;