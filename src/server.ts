import express from "express";
import { config } from "dotenv";
import { limiter } from "./middlewares/rateLimit";
import { router } from "./routes/routes";

config(); // dotenv

const app = express();
const PORT = process.env.PORT ?? 3000;

// Trust reverse proxy
app.set("trust proxy", true);
//middlewares
app.use(limiter);

// router
app.use("/", router);

app.listen(PORT, () => {
  console.log(`⚔️  API started ON PORT : ${PORT} @ STARTED  ⚔️`);
});

export default app;
