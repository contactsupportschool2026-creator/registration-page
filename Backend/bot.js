const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const axios       = require('axios');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const bot          = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

// Ensure the database file exists before the bot starts handling messages
initializeDB();