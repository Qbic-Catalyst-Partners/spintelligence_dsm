const swaggerJsdoc = require("swagger-jsdoc");
const port = 4000;
require('dotenv').config();

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DSM BACKEND APIs",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    servers: [{ url: process.env.SERVER_URL }],
  },
  apis: ["./routes/*.js"],
};

module.exports = swaggerJsdoc(options);
