import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use JSON payload parsing middleware
  app.use(express.json());

  // API endpoints FIRST
  app.post("/api/generate-recipe", async (req, res) => {
    try {
      const { ingredients, dietary, maxTime } = req.body;

      if (!ingredients || typeof ingredients !== "string" || !ingredients.trim()) {
        return res.status(400).json({ error: "Please enter some ingredients before generating!" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: "Gemini API key is not configured. Please add GEMINI_API_KEY to your environment variables."
        });
      }

      // Instantiate GoogleGenAI SDK as specified in the gemini-api skill
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      // Simple prompt building
      let prompt = `Generate a delicious recipe using these principal ingredients: ${ingredients}.`;
      if (dietary && dietary !== "None") {
        prompt += ` Ensure the recipe is suitable for a ${dietary} diet.`;
      }
      if (maxTime && maxTime !== "Any") {
        prompt += ` Try to keep the total preparation and cooking time under ${maxTime} minutes.`;
      }

      prompt += `
      Strict Guidelines:
      - Include a realistic recipes that tastes amazing.
      - You can assume the user has common pantry staples like salt, black pepper, water, cooking oil, but list most other ingredients.
      - Categorize difficulty strictly as one of: "Easy", "Medium", "Hard".
      - Ensure prepTime and cookTime are descriptive strings like "15 mins" or "1 hour".
      - Double-check that ingredients measurements are clear and friendly.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a master-class, friendly culinary chef. You specialize in crafting clear, foolproof, beautiful home-cooking recipes with available ingredients. Always respond in valid high-fidelity JSON following the exact schema required.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Catcy and appetizing title of the recipe." },
              description: { type: Type.STRING, description: "A one or two-sentence description explaining why this dish is tasty and worth making." },
              difficulty: { type: Type.STRING, description: "Complexity of cooking. Must be exactly 'Easy', 'Medium', or 'Hard'." },
              prepTime: { type: Type.STRING, description: "Estimated active prep time (e.g. '15 mins')." },
              cookTime: { type: Type.STRING, description: "Estimated cooking time (e.g. '30 mins')." },
              servings: { type: Type.STRING, description: "Standard yield of the recipe (e.g. '2 servings', '4 portions')." },
              ingredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Name of the ingredient (e.g. 'garlic cloves', 'chicken breast')." },
                    amount: { type: Type.STRING, description: "Measurement or quantity (e.g. '3 cloves', '500g', '1 tablespoon')." }
                  },
                  required: ["name", "amount"]
                },
                description: "Array of ingredients with specific proportions."
              },
              instructions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Sequential list of clear step-by-step instructions. Do not prefix with numbers."
              },
              tips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Chef's secrets or ingredient substitutions."
              },
            },
            required: ["title", "description", "difficulty", "prepTime", "cookTime", "ingredients", "instructions"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response got from culinary model. Try modifying ingredients.");
      }

      const cleanText = text.trim();
      const generatedRecipe = JSON.parse(cleanText);

      return res.json(generatedRecipe);
    } catch (err: any) {
      console.error("AI Generation failed:", err);
      return res.status(500).json({ error: err.message || "An unexpected error occurred while generating your recipe." });
    }
  });

  // Serve Vite in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    // In production, serve the compiled static asset tree
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static assets in production mode.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI Recipe Generator server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
