// Configuration for API endpoints
const API_CONFIG = {
  // Deployed Python backend on Render
  SIGN_LANGUAGE_API:
    process.env.REACT_APP_SIGN_LANGUAGE_API ||
    "https://gesture-classification-api-python.onrender.com",
};

export async function classifyGestureAPI(landmarks) {
  try {
    const response = await fetch(`${API_CONFIG.SIGN_LANGUAGE_API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ landmarks }),
    });

    const text = await response.text(); // Read response body as text for debugging
    console.log("Raw API response:", text);

    if (!response.ok) {
      // Try to parse error message from server response
      let errorMsg = text;
      try {
        const data = JSON.parse(text);
        errorMsg = data.message || text;
      } catch {
        // If JSON parsing fails, keep raw text
      }
      throw new Error(`API error: ${errorMsg}`);
    }

    const data = JSON.parse(text);
    return data.gesture;
  } catch (err) {
    if (err instanceof Error) {
      console.error("Gesture API error:", err.message);
    } else {
      console.error("Gesture API error:", err);
    }
    return "Error";
  }
}
