import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "react-toastify";

const extractErrorMessage = (error) =>
  error.response?.data?.message || error.message || "Something went wrong";

export const getMessages = createAsyncThunk(
  "message/getMessages",
  async (chatId, { rejectWithValue }) => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_BASE_URL}/messages/${chatId}`,
        { withCredentials: true }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

export const sendMessage = createAsyncThunk(
  "message/sendMessage",
  async ({ chatId, sender, text }, { rejectWithValue }) => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/messages`,
        { chatId, sender, text },
        { withCredentials: true }
      );
      return res.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

const messageSlice = createSlice({
  name: "message",
  initialState: {
    messages: [],
    loading: false,
    error: null,
  },
  reducers: {
    clearMessages: (state) => {
      state.messages = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getMessages.pending, (state) => {
        state.loading = true;
      })
      .addCase(getMessages.fulfilled, (state, action) => {
        state.loading = false;
        state.messages = action.payload;
      })
      .addCase(getMessages.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        toast.error(action.payload);
      })

      .addCase(sendMessage.fulfilled, (state, action) => {
        state.messages.push(action.payload);
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.error = action.payload;
        toast.error(action.payload);
      });
  },
});

export const { clearMessages } = messageSlice.actions;

export default messageSlice.reducer;
