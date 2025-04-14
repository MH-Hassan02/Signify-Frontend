import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_BASE_URL, {
  transports: ["websocket"],
  // autoConnect: false,
  withCredentials: true,
});

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
});

socket.on("disconnect", () => {
  console.log("❌ Socket disconnected");
});

export default socket;
