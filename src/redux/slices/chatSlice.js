import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "react-toastify";

const extractErrorMessage = (error) =>
  error.response?.data?.message || error.message || "Something went wrong";

// ✅ Get all chats for current user
export const getUserChats = createAsyncThunk(
  "chat/getUserChats",
  async (userId, { rejectWithValue }) => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_BASE_URL}/chats/${userId}`,
        { withCredentials: true }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

// ✅ Create or get existing chat
export const createOrGetChat = createAsyncThunk(
  "chat/createOrGetChat",
  async ({ senderId, receiverId }, { rejectWithValue }) => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/chats`,
        { senderId, receiverId },
        { withCredentials: true }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

const chatSlice = createSlice({
  name: "chat",
  initialState: {
    chatList: [],
    selectedChat: null,
    loading: false,
    error: null,
  },
  reducers: {
    selectChat: (state, action) => {
      state.selectedChat = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getUserChats.pending, (state) => {
        state.loading = true;
      })
      .addCase(getUserChats.fulfilled, (state, action) => {
        state.loading = false;
        state.chatList = action.payload;
      })
      .addCase(getUserChats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload);
      })

      .addCase(createOrGetChat.fulfilled, (state, action) => {
        const existingChat = state.chatList.find(
          (chat) => chat._id === action.payload._id
        );
        if (!existingChat) {
          state.chatList.push(action.payload);
        }
        state.selectedChat = action.payload;
      })
      .addCase(createOrGetChat.rejected, (state, action) => {
        state.error = action.payload;
        toast.error(action.payload);
      });
  },
});

export const { selectChat } = chatSlice.actions;

export default chatSlice.reducer;
