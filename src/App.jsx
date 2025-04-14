import { Route, Routes, useLocation } from "react-router-dom";
import Home from "./pages/home/Home";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/footer/Footer";
import BottomNav from "./components/bottomNav/BottomNav";
import Signup from "./pages/signup/Signup";
import Login from "./pages/login/Login";
import "./App.css";
import { useDispatch } from "react-redux";
import { fetchUser } from "./redux/slices/userSlice";
import { useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Calls from "./pages/calls/Calls";
import { VideoCallProvider } from "./contexts/VideoCallContext";
import socket from "./socket";
import IncomingCallPopup from "./components/chat/IncomingCallPopup";
import GlobalSocketListener from "./GlobalSocketListener";
import Profile from "./pages/Profile/Profile";

function App() {
  const location = useLocation();
  const hideNavFooter =
    location.pathname === "/register" ||
    location.pathname === "/login" ||
    location.pathname === "/calls";

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUser());

    // Connect once when app mounts
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.disconnect();
    };
  }, [dispatch]);

  return (
    <VideoCallProvider>
      <GlobalSocketListener />
      <div className={!hideNavFooter ? "bottomNavMargin" : ""}>
        {!hideNavFooter && <Navbar />}
        {!hideNavFooter && <BottomNav />}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
        {!hideNavFooter && <Footer />}
      </div>

      <ToastContainer
        autoClose={2000}
        position="top-right"
        hideProgressBar={false}
        closeOnClick
      />
      <IncomingCallPopup />
    </VideoCallProvider>
  );
}

export default App;
