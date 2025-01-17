import { action } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { internalQuery } from "./_generated/server";

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Temperature range validation (in Celsius)
const MIN_TEMP = -90; // Lowest recorded on Earth
const MAX_TEMP = 60;  // Highest recorded on Earth

// Country code validation regex (ISO 2-letter code)
const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

type WeatherResponse = {
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
  wind: {
    speed: number;
  };
};

type WeatherResult = {
  weatherId: Id<"weather">;
  current: {
    temperature: number;
    humidity: number;
    conditions: string;
    windSpeed: number;
  };
};

export const fetchWeather = action({
  args: {
    city: v.string(),
    country: v.string(),
  },
  handler: async (ctx, args): Promise<WeatherResult> => {
    // Validate country code
    if (!COUNTRY_CODE_REGEX.test(args.country)) {
      throw new Error("Invalid country code (must be ISO 2-letter code)");
    }

    // Check cache
    const cached = await ctx.runQuery(api.queries.getWeatherByLocation, {
      city: args.city,
      country: args.country,
    });

    if (cached && Date.now() - cached.lastUpdated < CACHE_DURATION) {
      return {
        weatherId: cached._id,
        current: {
          temperature: cached.temperature,
          humidity: cached.humidity,
          conditions: cached.conditions,
          windSpeed: cached.windSpeed,
        },
      };
    }

    // Get API key from environment
    const apiKey = ctx.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey) {
      throw new Error("OpenWeatherMap API key not configured");
    }

    // Fetch weather data
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("q", `${args.city},${args.country}`);
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric");

    let response: WeatherResponse;
    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      response = await res.json();
    } catch (error) {
      throw new Error(`Failed to fetch weather data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    // Validate data
    if (response.main.temp < MIN_TEMP || response.main.temp > MAX_TEMP) {
      throw new Error("Invalid temperature value from API");
    }
    if (response.main.humidity < 0 || response.main.humidity > 100) {
      throw new Error("Invalid humidity value from API");
    }
    if (response.wind.speed < 0) {
      throw new Error("Invalid wind speed value from API");
    }

    // Store weather data
    const now = Date.now();
    const weatherId = await ctx.runMutation(api.mutations.insertWeather, {
      city: args.city,
      country: args.country,
      timestamp: now,
      temperature: response.main.temp,
      humidity: response.main.humidity,
      conditions: response.weather[0].main,
      windSpeed: response.wind.speed,
      lastUpdated: now,
    });

    return {
      weatherId,
      current: {
        temperature: response.main.temp,
        humidity: response.main.humidity,
        conditions: response.weather[0].main,
        windSpeed: response.wind.speed,
      },
    };
  },
}); 