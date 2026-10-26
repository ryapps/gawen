import express from "express";
import { env } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import employeeRoutes from "./modules/employees/employees.routes.js";
import healthRoutes from "./health.js";
import errorHandler from "./middlewares/error.middleware.js";

const app = express();

app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(express.json({ limit: "16kb" }));

app.use("/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);

app.use(errorHandler);

export default app;