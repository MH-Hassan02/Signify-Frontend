import React, { useState, useEffect, useRef } from "react";
import * as handpose from "@tensorflow-models/handpose";
import * as tf from "@tensorflow/tfjs";
import { FaHandPaper, FaVolumeUp, FaHistory, FaPlus } from "react-icons/fa";
import { toast } from "react-toastify";
import { classifyGestureAPI } from "../../utils/classifyGestureAPI";
import "./SignLanguageTranslator.css";

const SignLanguageTranslator = ({ 
  videoRef, 
  isActive, 
  onGestureDetected, 
  onTranscriptUpdate,
  peerGesture = "No Hand Detected" 
}) => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [detectedGesture, setDetectedGesture] = useState("No Hand Detected");
  const [transcript, setTranscript] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gestureHistory, setGestureHistory] = useState([]);
  const [customGestures, setCustomGestures] = useState({});
  const [showHistory, setShowHistory] = useState(false);
  const [showCustomGestures, setShowCustomGestures] = useState(false);
  const [webglSupported, setWebglSupported] = useState(true);
  
  const handposeModel = useRef(null);
  const detectionInterval = useRef(null);
  const speechSynthesis = window.speechSynthesis;

  // Check WebGL support
  useEffect(() => {
    const checkWebGL = () => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
          console.warn('WebGL not supported, falling back to CPU');
          setWebglSupported(false);
          return false;
        }
        
        // Check if WebGL is actually working
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          console.log('WebGL Renderer:', renderer);
        }
        
        return true;
      } catch (e) {
        console.warn('WebGL check failed:', e);
        setWebglSupported(false);
        return false;
      }
    };
    
    checkWebGL();
  }, []);

  // Initialize TensorFlow.js backend
  useEffect(() => {
    const initializeBackend = async () => {
      try {
        if (webglSupported) {
          await tf.setBackend('webgl');
          console.log('Using WebGL backend');
        } else {
          await tf.setBackend('cpu');
          console.log('Using CPU backend (WebGL not available)');
        }
      } catch (error) {
        console.warn('Failed to set backend, using default:', error);
        await tf.setBackend('cpu');
      }
    };

    initializeBackend();
  }, [webglSupported]);

  // Initialize handpose model
  useEffect(() => {
    const loadHandpose = async () => {
      try {
        await tf.setBackend("webgl");
        handposeModel.current = await handpose.load();
        console.log("Handpose model loaded successfully");
        setIsModelLoaded(true);
        toast.success("Sign language detection ready!");
      } catch (err) {
        console.error("Failed to load handpose model:", err);
        toast.error("Failed to load sign language detection model");
      }
    };
    loadHandpose();

    return () => {
      if (handposeModel.current) {
        handposeModel.current = null;
      }
    };
  }, []);

  // Gesture detection logic
  useEffect(() => {
    if (isActive && isModelLoaded && handposeModel.current && videoRef?.current) {
      const detect = async () => {
        try {
          const hands = await handposeModel.current.estimateHands(
            videoRef.current,
            false
          );
          
          if (hands && hands.length > 0 && hands[0].landmarks) {
            console.log("Sending landmarks for classification");
            const gesture = await classifyGestureAPI(hands[0].landmarks);
            console.log("Detected gesture:", gesture);
            
            if (gesture && gesture !== "Error" && gesture !== "Unknown") {
              setDetectedGesture(gesture);
              onGestureDetected?.(gesture);
              
              // Add to transcript
              const newTranscript = transcript + (transcript ? " " : "") + gesture;
              setTranscript(newTranscript);
              onTranscriptUpdate?.(newTranscript);
              
              // Add to history
              const historyItem = {
                gesture,
                timestamp: new Date().toLocaleTimeString(),
                id: Date.now()
              };
              setGestureHistory(prev => [historyItem, ...prev.slice(0, 9)]); // Keep last 10
            } else {
              setDetectedGesture("No Hand Detected");
            }
          } else {
            setDetectedGesture("No Hand Detected");
          }
        } catch (err) {
          console.error("Error detecting gesture:", err);
          setDetectedGesture("Detection Error");
        }
      };

      detectionInterval.current = setInterval(detect, 200); // Detect every 200ms
      
      return () => {
        if (detectionInterval.current) {
          clearInterval(detectionInterval.current);
        }
      };
    }
  }, [isActive, isModelLoaded, videoRef, transcript, onGestureDetected, onTranscriptUpdate]);

  // Text-to-Speech functionality
  const speakText = (text) => {
    if (speechSynthesis && text) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.8; // Slightly slower for clarity
      utterance.pitch = 1;
      utterance.volume = 1;
      
      setIsSpeaking(true);
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      
      utterance.onerror = () => {
        setIsSpeaking(false);
        toast.error("Text-to-speech failed");
      };
      
      speechSynthesis.speak(utterance);
    }
  };

  const speakTranscript = () => {
    if (transcript) {
      speakText(transcript);
    } else {
      toast.info("No transcript to speak");
    }
  };

  const speakGesture = (gesture) => {
    if (gesture && gesture !== "No Hand Detected") {
      speakText(gesture);
    }
  };

  // Custom gestures management
  const addCustomGesture = () => {
    const gestureName = prompt("Enter custom gesture name:");
    const gestureTranslation = prompt("Enter translation for this gesture:");
    
    if (gestureName && gestureTranslation) {
      setCustomGestures(prev => ({
        ...prev,
        [gestureName]: gestureTranslation
      }));
      toast.success(`Custom gesture "${gestureName}" added!`);
    }
  };

  const clearTranscript = () => {
    setTranscript("");
    onTranscriptUpdate?.("");
  };

  const clearHistory = () => {
    setGestureHistory([]);
  };

  return (
    <div className="signLanguageTranslator">
      <div className="translatorHeader">
        <h3>Sign Language Translator</h3>
        <div className="statusIndicators">
          <span className={`status ${isModelLoaded ? 'loaded' : 'loading'}`}>
            {isModelLoaded ? 'Model Ready' : 'Loading Model...'}
          </span>
          <span className={`status ${webglSupported ? 'webgl' : 'cpu'}`}>
            {webglSupported ? 'WebGL' : 'CPU Mode'}
          </span>
        </div>
      </div>
      
      {!webglSupported && (
        <div className="webglWarning">
          <p>⚠️ WebGL not supported. Using CPU mode (slower performance).</p>
          <p>For better performance, try:</p>
          <ul>
            <li>Updating your browser</li>
            <li>Enabling hardware acceleration</li>
            <li>Using Chrome or Firefox</li>
          </ul>
        </div>
      )}

      {/* Main Controls */}
      <div className="translatorControls">
        <div className="gestureDisplay">
          <h3>Detected Gesture</h3>
          <div className="gestureText">
            {detectedGesture}
            {detectedGesture !== "No Hand Detected" && (
              <button 
                className="speakButton"
                onClick={() => speakGesture(detectedGesture)}
                disabled={isSpeaking}
              >
                <FaVolumeUp />
              </button>
            )}
          </div>
        </div>

        <div className="peerGestureDisplay">
          <h3>Peer's Gesture</h3>
          <div className="gestureText">
            {peerGesture}
            {peerGesture !== "No Hand Detected" && (
              <button 
                className="speakButton"
                onClick={() => speakGesture(peerGesture)}
                disabled={isSpeaking}
              >
                <FaVolumeUp />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transcript Section */}
      <div className="transcriptSection">
        <div className="transcriptHeader">
          <h3>Transcript</h3>
          <div className="transcriptControls">
            <button 
              className="speakButton"
              onClick={speakTranscript}
              disabled={isSpeaking || !transcript}
              title="Speak transcript"
            >
              <FaVolumeUp />
            </button>
            <button 
              className="clearButton"
              onClick={clearTranscript}
              disabled={!transcript}
              title="Clear transcript"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="transcriptText">
          {transcript || "No gestures detected yet..."}
        </div>
      </div>

      {/* History and Custom Gestures */}
      <div className="additionalFeatures">
        <button 
          className="historyButton"
          onClick={() => setShowHistory(!showHistory)}
        >
          <FaHistory /> History ({gestureHistory.length})
        </button>
        
        <button 
          className="customGestureButton"
          onClick={() => setShowCustomGestures(!showCustomGestures)}
        >
          <FaPlus /> Custom Gestures
        </button>
      </div>

      {/* Gesture History Modal */}
      {showHistory && (
        <div className="historyModal">
          <div className="modalContent">
            <h3>Gesture History</h3>
            <button className="closeButton" onClick={() => setShowHistory(false)}>
              ×
            </button>
            <div className="historyList">
              {gestureHistory.length > 0 ? (
                gestureHistory.map((item) => (
                  <div key={item.id} className="historyItem">
                    <span className="gestureName">{item.gesture}</span>
                    <span className="timestamp">{item.timestamp}</span>
                    <button 
                      className="speakButton small"
                      onClick={() => speakGesture(item.gesture)}
                    >
                      <FaVolumeUp />
                    </button>
                  </div>
                ))
              ) : (
                <p>No gestures in history</p>
              )}
            </div>
            {gestureHistory.length > 0 && (
              <button className="clearButton" onClick={clearHistory}>
                Clear History
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom Gestures Modal */}
      {showCustomGestures && (
        <div className="customGesturesModal">
          <div className="modalContent">
            <h3>Custom Gestures</h3>
            <button className="closeButton" onClick={() => setShowCustomGestures(false)}>
              ×
            </button>
            <button className="addButton" onClick={addCustomGesture}>
              <FaPlus /> Add New Gesture
            </button>
            <div className="customGesturesList">
              {Object.keys(customGestures).length > 0 ? (
                Object.entries(customGestures).map(([gesture, translation]) => (
                  <div key={gesture} className="customGestureItem">
                    <span className="gestureName">{gesture}</span>
                    <span className="translation">→ {translation}</span>
                  </div>
                ))
              ) : (
                <p>No custom gestures added yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignLanguageTranslator; 