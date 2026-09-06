import { Router } from "express";
import { StatusCodes } from "http-status-codes";

import { pool } from "../db/index.js";

const router = Router();

// Render polls this to decide whether the instance is still worth routing
// traffic to. The database is the one dependency the process cannot recover
// from on its own, so that's what gets checked -- not Cloudinary or Resend,
// which fail per-request without taking the whole app down.
router.get("/", async function (req, res) {
  try {
    await pool.query("SELECT 1");
    return res.status(StatusCodes.OK).json({ success: true, status: "ok" });
  } catch (error) {
    req.log.error(error, "Health check failed");
    return res
      .status(StatusCodes.SERVICE_UNAVAILABLE)
      .json({ success: false, status: "error" });
  }
});

export default router;
