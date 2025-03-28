
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import connectDB from './config/database.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';

// Import Routes
import userRoutes from './routes/userRoutes.js';
import medicationRoutes from './routes/medicationRoutes.js';
import dispenserRoutes from './routes/dispenserRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';

// Import WebSocket and MQTT setup
import setupWebSocket from './websockets/websocketServer.js';
// import setupMQTT from './mqtt/mqttClient.js';
import MQTTController from './mqtt/mqttClient.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('dev'));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/dispensers', dispenserRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/inventory', inventoryRoutes);

// Error Handling
app.use(notFound);
app.use(errorHandler);

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Setup WebSocket server using the HTTP server instance
setupWebSocket(server);

// Setup MQTT client
// setupMQTT();
MQTTController.connect();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

export default app;