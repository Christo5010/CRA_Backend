import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser';
const app = express();

const port = process.env.PORT || 8000

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            process.env.FRONTEND_URL || "http://localhost:5173",
            "http://localhost:3000"
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // CORS blocked origin
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}))

app.use(express.json({limit:"50mb"}))
app.use(express.urlencoded({extended:true, limit:"50mb"}))
app.use(express.static("public"))
app.use(cookieParser())

// Import routes
import { router } from './routes/user.routes.js';
import { documentRouter } from './routes/document.routes.js';
import { automationRouter } from './routes/automation.routes.js';
import { craRouter } from './routes/cra.routes.js';
import { clientRouter } from './routes/client.routes.js';
import { actionLogRouter } from './routes/actionLog.routes.js';

// Use routes
app.use("/v1/api/user", router)
app.use("/v1/api/documents", documentRouter);
app.use("/v1/api/automation", automationRouter);
app.use("/v1/api/cra", craRouter);
app.use("/v1/api/client", clientRouter);
app.use("/v1/api/action-log", actionLogRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    errors: err.errors || [],
    data: null
  });
});

app.listen(port, () => {
  // Server started
})

export default app