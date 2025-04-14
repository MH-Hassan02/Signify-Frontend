import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./slices/userSlice";
import chatReducer from "./slices/chatSlice";
import messageReducer from "./slices/messageSlice";

const store = configureStore({
  reducer: {
    user: userReducer,
    chat: chatReducer,
    message: messageReducer,
  },
});

export default store;
