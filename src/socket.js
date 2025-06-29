import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_BASE_URL, {
  transports: ["websocket"],
  // autoConnect: false,
  withCredentials: true,
  timeout: 5000, // 5 second timeout for connection
  reconnection: true,
  reconnectionAttempts: 3,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Socket disconnected");
});

socket.on("connect_error", (error) => {
  console.error("❌ Socket connection error:", error);
});

export default socket;
