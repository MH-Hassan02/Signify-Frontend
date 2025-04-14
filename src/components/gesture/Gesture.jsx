import React from "react";
import gestureImg from "../../images/gesture.jpg";
import "./Gesture.css";

const Gesture = () => {
  return (
    <>
      <div className="gestureContainer">
        <div className="gestureMain">
          <div className="gestureTextBox">
            <div className="gestureText">
              <h1>Let Your Hands Speak, We Listen.</h1>
              <h3>Lost in Translation? Not Anymore.</h3>
              <p>
                Bridge the gap with Signify—where gestures turn into
                conversations. Our advanced sign language recognition technology
                ensures that every expression is understood, making
                communication seamless, inclusive, and effortless.
              </p>
            </div>
          </div>
          <div className="gestureImg">
            <img src={gestureImg} alt="Call Image" />
          </div>
        </div>
      </div>
    </>
  );
};

export default Gesture;
