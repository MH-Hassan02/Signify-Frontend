import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import { toast } from "react-toastify";

const extractErrorMessage = (error) => {
  return (
    error.response?.data?.message ||
    error.response?.data ||
    error.message ||
    "Something went wrong"
  );
};

// Signup
export const registerUser = createAsyncThunk(
  "user/register",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/auth/signup`,
        userData,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

// Login
export const loginUser = createAsyncThunk(
  "user/login",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/auth/login`,
        userData,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

// Google Sign-in
export const googleSignIn = createAsyncThunk(
  "user/googleSignIn",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/auth/google-signin`,
        userData,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

// Fetch User
export const fetchUser = createAsyncThunk(
  "user/fetchUser",
  async (_, { rejectWithValue, dispatch }) => {
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_BASE_URL}/auth/user`,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      dispatch(showErrorToast(errorMessage));
      return rejectWithValue(errorMessage);
    }
  }
);

const showErrorToast = (message) => {
  toast.error(message);
};

// Logout
export const logoutUser = createAsyncThunk(
  "user/logout",
  async (_, { rejectWithValue }) => {
    try {
      await axios.post(
        `${import.meta.env.VITE_BASE_URL}/auth/logout`,
        {},
        { withCredentials: true }
      );
      return null;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  }
);

const userSlice = createSlice({
  name: "user",
  initialState: { userInfo: null, loading: true, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Signup
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = { message: action.payload };
        toast.error(action.payload);
      })

      // Login
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload.user;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = { message: action.payload };
        toast.error(action.payload);
      })

      // Google Sign-In
      .addCase(googleSignIn.fulfilled, (state, action) => {
        state.userInfo = action.payload.user;
      })
      .addCase(googleSignIn.rejected, (state, action) => {
        state.error = { message: action.payload };
        toast.error(action.payload);
      })

      // Fetch User
      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.loading = false;
        state.userInfo = action.payload;
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.loading = false;
        state.userInfo = null;
        state.error = { message: action.payload };
        toast.error(action.payload);
      })

      // Logout
      .addCase(logoutUser.fulfilled, (state) => {
        state.userInfo = null;
      });
  },
});

export default userSlice.reducer;
