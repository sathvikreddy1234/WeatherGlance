require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const cors = require("cors");
const SunCalc = require("suncalc");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

app.use(express.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Connected ✓"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// User Schema
const UserSchema = new mongoose.Schema({
    username: String,
    email: { type: String, unique: true },
    password: String,
    favoriteCities: [String],
});
const User = mongoose.model("User", UserSchema);

// Signup
app.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();
        res.json({ message: "User registered successfully" });
    } catch (err) {
        res.status(500).json({ error: "Error registering user" });
    }
});

// Login
app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "1h" });
        res.json({ token, user });
    } catch (err) {
        res.status(500).json({ error: "Error logging in" });
    }
});

// Weather Forecast API (Without AQI)
app.get("/forecast", async (req, res) => {
    try {
        let { city } = req.query;
        console.log("Requested City:", city);
        if (!city) return res.status(400).json({ message: "City parameter is required" });

        const weatherResponse = await axios.get(
            `https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${WEATHER_API_KEY}&units=metric`
        );

        const forecastData = weatherResponse.data.list.map(entry => {
            const { dt, main, wind, weather } = entry;
            const windDir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(wind.deg / 45) % 8];
            const date = new Date(dt * 1000);
            const sunTimes = SunCalc.getTimes(date, weatherResponse.data.city.coord.lat, weatherResponse.data.city.coord.lon);
            const rainPrediction = weather[0].main.toLowerCase().includes("rain") ? "Rain expected soon" : "No rain expected";
            const weatherAlert = main.temp > 35 ? "Heatwave warning! Stay hydrated." : "Weather is clear.";
            const clothingSuggestion = main.temp < 10 ? "Wear warm clothes." : "T-shirt is fine.";

            return {
                date,
                temperature: main.temp,
                feels_like: main.feels_like,
                wind_speed: wind.speed,
                wind_direction: windDir,
                sunrise: sunTimes.sunrise,
                sunset: sunTimes.sunset,
                weather_condition: weather[0].description,
                rain_prediction: rainPrediction,
                weather_alert: weatherAlert,
                clothing_suggestion: clothingSuggestion,
            };
        });

        res.json({ city, forecast: forecastData });
    } catch (err) {
        console.error("Weather API Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ message: "Error fetching forecast data", error: err.response ? err.response.data : err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} 🚀`);
});
