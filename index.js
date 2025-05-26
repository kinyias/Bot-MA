const express = require('express');
const cors = require('cors');
const ccxt = require('ccxt');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

class CryptoScalpingBot {
    constructor() {
        // Initialize Express app
        this.app = express();
        this.port = process.env.PORT || 3000;
        
        // Middleware
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static('public'));
        
        // Initialize Discord bot
        this.discordBot = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });
        this.channelId = process.env.DISCORD_CHANNEL_ID;
        this.discordReady = false;
        
        // Initialize exchange (Binance)
        this.exchange = new ccxt.binanceusdm();
        
        // Trading configuration
        this.config = {
            symbol: process.env.TRADING_PAIR || 'BTC/USDT',
            timeframe: process.env.TIMEFRAME || '5m',
            ma1Period: 25,
            ma2Period: 99,
            riskRewardRatio: 2,
            stopLossPercent: 1,
            checkInterval: 60000,
            isActive: false
        };
        
        // State tracking
        this.lastSignal = null;
        this.priceHistory = [];
        this.signals = [];
        this.stats = {
            totalSignals: 0,
            buySignals: 0,
            sellSignals: 0,
            uptime: Date.now()
        };
        this.intervalId = null;
        
        // Setup Discord bot events
        this.setupDiscordBot();
        
        // Setup routes
        this.setupRoutes();
        
        console.log('🤖 Crypto Scalping Bot with Discord integration initialized');
    }
    
    // Setup Discord bot events
    setupDiscordBot() {
        this.discordBot.once('ready', () => {
            console.log(`✅ Discord bot connected: ${this.discordBot.user.tag}`);
            this.discordReady = true;
        });
        
        this.discordBot.on('error', (error) => {
            console.error('❌ Discord bot error:', error);
        });
        
        // Optional: Add slash commands or message commands
        this.discordBot.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            
            if (message.content === '!bot-status') {
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Crypto Scalping Bot Status')
                    .setColor(this.config.isActive ? 0x00FF00 : 0xFF0000)
                    .addFields(
                        { name: 'Status', value: this.config.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
                        { name: 'Symbol', value: this.config.symbol, inline: true },
                        { name: 'Timeframe', value: this.config.timeframe, inline: true },
                        { name: 'Total Signals', value: this.stats.totalSignals.toString(), inline: true },
                        { name: 'Buy Signals', value: this.stats.buySignals.toString(), inline: true },
                        { name: 'Sell Signals', value: this.stats.sellSignals.toString(), inline: true }
                    )
                    .setTimestamp();
                
                await message.reply({ embeds: [embed] });
            }
        });
    }
    
    // Setup Express routes
    setupRoutes() {
        // Serve dashboard
        this.app.get('/', (req, res) => {
            res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Scalping Bot Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #1a1a1a; color: #fff; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .status { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
        .card { background: #2d2d2d; padding: 20px; border-radius: 10px; flex: 1; min-width: 250px; }
        .card h3 { color: #5865F2; margin-bottom: 10px; }
        .controls { display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap; }
        .btn { padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; transition: all 0.3s; }
        .btn-primary { background: #5865F2; color: white; }
        .btn-danger { background: #ED4245; color: white; }
        .btn:hover { opacity: 0.8; transform: translateY(-2px); }
        .signals { margin-top: 30px; }
        .signal { background: #2d2d2d; margin: 10px 0; padding: 15px; border-radius: 5px; border-left: 4px solid; }
        .signal.buy { border-left-color: #57F287; }
        .signal.sell { border-left-color: #ED4245; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-active { background: #57F287; }
        .status-inactive { background: #ED4245; }
        .config-form { background: #2d2d2d; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; color: #ccc; }
        .form-group input, .form-group select { width: 100%; padding: 8px; border: 1px solid #555; background: #1a1a1a; color: #fff; border-radius: 4px; }
        .discord-badge { background: #5865F2; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; margin-left: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Crypto Scalping Bot Dashboard <span class="discord-badge">Discord Bot</span></h1>
            <p>Real-time monitoring and control with Discord notifications</p>
        </div>
        
        <div class="status" id="status">
            <div class="card">
                <h3>Bot Status</h3>
                <p><span class="status-indicator" id="statusIndicator"></span><span id="botStatus">Loading...</span></p>
                <p><strong>Symbol:</strong> <span id="symbol">-</span></p>
                <p><strong>Timeframe:</strong> <span id="timeframe">-</span></p>
                <p><strong>Discord:</strong> <span id="discordStatus">Connecting...</span></p>
            </div>
            <div class="card">
                <h3>Statistics</h3>
                <p><strong>Total Signals:</strong> <span id="totalSignals">0</span></p>
                <p><strong>Buy Signals:</strong> <span id="buySignals">0</span></p>
                <p><strong>Sell Signals:</strong> <span id="sellSignals">0</span></p>
                <p><strong>Uptime:</strong> <span id="uptime">-</span></p>
            </div>
            <div class="card">
                <h3>Current Price</h3>
                <p><strong>Price:</strong> $<span id="currentPrice">-</span></p>
                <p><strong>MA(25):</strong> <span id="ma1">-</span></p>
                <p><strong>MA(99):</strong> <span id="ma2">-</span></p>
            </div>
        </div>
        
        <div class="controls">
            <button class="btn btn-primary" onclick="startBot()">▶️ Start Bot</button>
            <button class="btn btn-danger" onclick="stopBot()">⏹️ Stop Bot</button>
            <button class="btn btn-primary" onclick="analyzeNow()">🔍 Analyze Now</button>
            <button class="btn btn-primary" onclick="refreshData()">🔄 Refresh</button>
        </div>
        
        <div class="config-form">
            <h3>Configuration</h3>
            <div class="form-group">
                <label>Trading Pair:</label>
                <input type="text" id="symbolInput" placeholder="BTC/USDT">
            </div>
            <div class="form-group">
                <label>Timeframe:</label>
                <select id="timeframeInput">
                    <option value="1m">1 minute</option>
                    <option value="5m" selected>5 minutes</option>
                    <option value="15m">15 minutes</option>
                    <option value="1h">1 hour</option>
                </select>
            </div>
            <button class="btn btn-primary" onclick="updateConfig()">💾 Update Config</button>
        </div>
        
        <div class="signals">
            <h3>Recent Signals</h3>
            <div id="signalsList">
                <p>No signals yet...</p>
            </div>
        </div>
    </div>
    
    <script>
        async function makeRequest(url, options = {}) {
            try {
                const response = await fetch(url, options);
                return await response.json();
            } catch (error) {
                console.error('Request failed:', error);
                return { error: error.message };
            }
        }
        
        async function startBot() {
            const result = await makeRequest('/api/start', { method: 'POST' });
            if (result.success) {
                alert('Bot started successfully!');
                refreshData();
            } else {
                alert('Failed to start bot: ' + (result.error || 'Unknown error'));
            }
        }
        
        async function stopBot() {
            const result = await makeRequest('/api/stop', { method: 'POST' });
            if (result.success) {
                alert('Bot stopped successfully!');
                refreshData();
            } else {
                alert('Failed to stop bot: ' + (result.error || 'Unknown error'));
            }
        }
        
        async function analyzeNow() {
            const result = await makeRequest('/api/analyze', { method: 'POST' });
            if (result.success) {
                alert('Market analysis completed!');
                refreshData();
            } else {
                alert('Analysis failed: ' + (result.error || 'Unknown error'));
            }
        }
        
        async function updateConfig() {
            const symbol = document.getElementById('symbolInput').value;
            const timeframe = document.getElementById('timeframeInput').value;
            
            const result = await makeRequest('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, timeframe })
            });
            
            if (result.success) {
                alert('Configuration updated successfully!');
                refreshData();
            } else {
                alert('Failed to update config: ' + (result.error || 'Unknown error'));
            }
        }
        
        async function refreshData() {
            const status = await makeRequest('/api/status');
            const signals = await makeRequest('/api/signals');
            
            updateStatus(status);
            updateSignals(signals);
        }
        
        function updateStatus(data) {
            if (data.error) return;
            
            document.getElementById('botStatus').textContent = data.isActive ? 'Active' : 'Inactive';
            document.getElementById('statusIndicator').className = 'status-indicator ' + (data.isActive ? 'status-active' : 'status-inactive');
            document.getElementById('symbol').textContent = data.symbol || '-';
            document.getElementById('timeframe').textContent = data.timeframe || '-';
            document.getElementById('discordStatus').textContent = data.discordReady ? '🟢 Connected' : '🔴 Disconnected';
            document.getElementById('totalSignals').textContent = data.stats.totalSignals || 0;
            document.getElementById('buySignals').textContent = data.stats.buySignals || 0;
            document.getElementById('sellSignals').textContent = data.stats.sellSignals || 0;
            document.getElementById('currentPrice').textContent = data.currentPrice || '-';
            document.getElementById('ma1').textContent = data.ma1 || '-';
            document.getElementById('ma2').textContent = data.ma2 || '-';
            
            const uptime = data.stats.uptime ? Math.floor((Date.now() - data.stats.uptime) / 1000 / 60) : 0;
            document.getElementById('uptime').textContent = uptime + ' minutes';
        }
        
        function updateSignals(data) {
            if (data.error || !data.signals) return;
            
            const signalsList = document.getElementById('signalsList');
            if (data.signals.length === 0) {
                signalsList.innerHTML = '<p>No signals yet...</p>';
                return;
            }
            
            signalsList.innerHTML = data.signals.slice(-10).reverse().map(function(signal) {
                return '<div class="signal ' + signal.type.toLowerCase() + '">' +
                    '<strong>' + signal.type + ' Signal</strong> - ' + new Date(signal.timestamp).toLocaleString() + '<br>' +
                    'Entry: $' + signal.entryPrice.toFixed(6) + ' | ' +
                    'TP: $' + signal.takeProfit.toFixed(6) + ' | ' +
                    'SL: $' + signal.stopLoss.toFixed(6) +
                '</div>';
            }).join('');
        }
        
        // Auto refresh every 30 seconds
        setInterval(refreshData, 30000);
        
        // Initial load
        refreshData();
    </script>
</body>
</html>`);
        });
        
        // API Routes
        this.app.get('/api/status', (req, res) => {
            res.json({
                isActive: this.config.isActive,
                symbol: this.config.symbol,
                timeframe: this.config.timeframe,
                stats: this.stats,
                currentPrice: this.currentPrice,
                ma1: this.ma1,
                ma2: this.ma2,
                discordReady: this.discordReady
            });
        });
        
        this.app.post('/api/start', async (req, res) => {
            try {
                if (this.config.isActive) {
                    return res.json({ success: false, error: 'Bot is already running' });
                }
                
                await this.startBot();
                res.json({ success: true, message: 'Bot started successfully' });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
        
        this.app.post('/api/stop', async (req, res) => {
            try {
                if (!this.config.isActive) {
                    return res.json({ success: false, error: 'Bot is not running' });
                }
                
                await this.stopBot();
                res.json({ success: true, message: 'Bot stopped successfully' });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
        
        this.app.post('/api/analyze', async (req, res) => {
            try {
                await this.analyzeMarket();
                res.json({ success: true, message: 'Market analysis completed' });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
        
        this.app.get('/api/signals', (req, res) => {
            res.json({ signals: this.signals });
        });
        
        this.app.put('/api/config', (req, res) => {
            try {
                const { symbol, timeframe } = req.body;
                
                if (symbol) this.config.symbol = symbol;
                if (timeframe) this.config.timeframe = timeframe;
                
                res.json({ success: true, message: 'Configuration updated' });
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });
        
        this.app.get('/api/price/:symbol', async (req, res) => {
            try {
                const symbol = req.params.symbol || this.config.symbol;
                const price = await this.getCurrentPrice(symbol);
                res.json({ symbol, price });
            } catch (error) {
                res.json({ error: error.message });
            }
        });
    }
    
    // Calculate Simple Moving Average
    calculateSMA(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(-period);
        const sum = slice.reduce((acc, val) => acc + val, 0);
        return sum / period;
    }
    
    // Fetch OHLCV data from exchange
    async fetchOHLCV(symbol = null) {
        try {
            const tradingSymbol = symbol || this.config.symbol;
            const ohlcv = await this.exchange.fetchOHLCV(
                tradingSymbol,
                this.config.timeframe,
                undefined,
                this.config.ma2Period + 10
            );
            
            return ohlcv.map(candle => ({
                timestamp: candle[0],
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            }));
        } catch (error) {
            console.error('❌ Error fetching OHLCV data:', error.message);
            return null;
        }
    }
    
    // Get current market price
    async getCurrentPrice(symbol = null) {
        try {
            const tradingSymbol = symbol || this.config.symbol;
            const ticker = await this.exchange.fetchTicker(tradingSymbol);
            this.currentPrice = ticker.last;
            return ticker.last;
        } catch (error) {
            console.error('❌ Error fetching current price:', error.message);
            return null;
        }
    }
    
    // Calculate take profit and stop loss levels
    calculateLevels(entryPrice, signalType) {
        const stopLossDistance = entryPrice * (this.config.stopLossPercent / 100);
        const takeProfitDistance = stopLossDistance * this.config.riskRewardRatio;
        
        let stopLoss, takeProfit;
        
        if (signalType === 'BUY') {
            stopLoss = entryPrice - stopLossDistance;
            takeProfit = entryPrice + takeProfitDistance;
        } else {
            stopLoss = entryPrice + stopLossDistance;
            takeProfit = entryPrice - takeProfitDistance;
        }
        
        return {
            stopLoss: Number(stopLoss.toFixed(6)),
            takeProfit: Number(takeProfit.toFixed(6))
        };
    }
    
    // Send Discord alert
    async sendDiscordAlert(signal) {
        try {
            if (!this.discordReady || !this.channelId) {
                console.log('⚠️ Discord not ready or channel ID not configured');
                return;
            }
            
            const channel = await this.discordBot.channels.fetch(this.channelId);
            if (!channel) {
                console.error('❌ Discord channel not found');
                return;
            }
            
            const { type, entryPrice, stopLoss, takeProfit, ma1, ma2, timestamp } = signal;
            
            const color = type === 'BUY' ? 0x57F287 : 0xED4245; // Green for BUY, Red for SELL
            const emoji = type === 'BUY' ? '🟢' : '🔴';
            const direction = type === 'BUY' ? '📈' : '📉';
            
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} CRYPTO SCALPING SIGNAL`)
                .setDescription(`${direction} **${type} SIGNAL DETECTED**`)
                .setColor(color)
                .addFields(
                    { name: '💰 Trading Pair', value: this.config.symbol, inline: true },
                    { name: '⏰ Timeframe', value: this.config.timeframe, inline: true },
                    { name: '📊 Entry Price', value: `$${entryPrice.toFixed(6)}`, inline: true },
                    { name: '🎯 Take Profit', value: `$${takeProfit.toFixed(6)}`, inline: true },
                    { name: '🛑 Stop Loss', value: `$${stopLoss.toFixed(6)}`, inline: true },
                    { name: '💡 Risk/Reward', value: `1:${this.config.riskRewardRatio}`, inline: true },
                    { name: `📈 MA(${this.config.ma1Period})`, value: ma1.toFixed(6), inline: true },
                    { name: `📉 MA(${this.config.ma2Period})`, value: ma2.toFixed(6), inline: true },
                    { name: '⚡ Risk Warning', value: 'Trade at your own risk!', inline: false }
                )
                .setTimestamp(new Date(timestamp))
                .setFooter({ text: 'Crypto Scalping Bot', iconURL: 'https://cdn.discordapp.com/attachments/123456789/bot-icon.png' });
            
            await channel.send({ embeds: [embed] });
            console.log(`🎯 Discord alert sent: ${type} signal for ${this.config.symbol}`);
            
        } catch (error) {
            console.error('❌ Error sending Discord message:', error.message);
        }
    }
    
    // Detect MA crossover signals
    detectSignal(ma1Current, ma2Current, ma1Previous, ma2Previous) {
        if (ma1Previous <= ma2Previous && ma1Current > ma2Current) {
            return 'BUY';
        }
        
        if (ma1Previous >= ma2Previous && ma1Current < ma2Current) {
            return 'SELL';
        }
        
        return null;
    }
    
    // Main analysis function
    async analyzeMarket() {
        try {
            console.log(`🔍 Analyzing ${this.config.symbol} at ${new Date().toLocaleString()}`);
            
            const ohlcvData = await this.fetchOHLCV();
            if (!ohlcvData || ohlcvData.length < this.config.ma2Period) {
                console.log('⚠️ Insufficient data for analysis');
                return;
            }
            
            const closingPrices = ohlcvData.map(d => d.close);
            
            const ma1Current = this.calculateSMA(closingPrices, this.config.ma1Period);
            const ma2Current = this.calculateSMA(closingPrices, this.config.ma2Period);
            const ma1Previous = this.calculateSMA(closingPrices.slice(0, -1), this.config.ma1Period);
            const ma2Previous = this.calculateSMA(closingPrices.slice(0, -1), this.config.ma2Period);
            
            this.ma1 = ma1Current;
            this.ma2 = ma2Current;
            
            if (!ma1Current || !ma2Current || !ma1Previous || !ma2Previous) {
                console.log('⚠️ Unable to calculate moving averages');
                return;
            }
            
            const signalType = this.detectSignal(ma1Current, ma2Current, ma1Previous, ma2Previous);
            
            if (signalType) {
                const currentPrice = await this.getCurrentPrice();
                if (!currentPrice) {
                    console.log('⚠️ Unable to get current price');
                    return;
                }
                
                const currentTime = Date.now();
                if (this.lastSignal && 
                    this.lastSignal.type === signalType && 
                    (currentTime - this.lastSignal.timestamp) < 300000) {
                    console.log('🔄 Signal cooldown active, skipping duplicate signal');
                    return;
                }
                
                const levels = this.calculateLevels(currentPrice, signalType);
                
                const signal = {
                    type: signalType,
                    entryPrice: currentPrice,
                    stopLoss: levels.stopLoss,
                    takeProfit: levels.takeProfit,
                    ma1: ma1Current,
                    ma2: ma2Current,
                    timestamp: currentTime
                };
                
                await this.sendDiscordAlert(signal);
                
                this.lastSignal = signal;
                this.signals.push(signal);
                this.stats.totalSignals++;
                if (signalType === 'BUY') this.stats.buySignals++;
                else this.stats.sellSignals++;
                
                console.log(`🎯 ${signalType} signal generated at $${currentPrice.toFixed(6)}`);
            } else {
                console.log(`📊 No signal - MA(${this.config.ma1Period}): ${ma1Current.toFixed(6)}, MA(${this.config.ma2Period}): ${ma2Current.toFixed(6)}`);
            }
            
        } catch (error) {
            console.error('❌ Error in market analysis:', error.message);
        }
    }
    
    // Start the bot
    async startBot() {
        try {
            if (this.config.isActive) {
                throw new Error('Bot is already running');
            }
            
            await this.exchange.loadMarkets();
            console.log('✅ Exchange connection established');
            
            if (this.discordReady && this.channelId) {
                const channel = await this.discordBot.channels.fetch(this.channelId);
                
                const embed = new EmbedBuilder()
                    .setTitle('🤖 Crypto Scalping Bot Started')
                    .setDescription('Bot is now monitoring the market for trading signals')
                    .setColor(0x57F287)
                    .addFields(
                        { name: '📊 Monitoring', value: this.config.symbol, inline: true },
                        { name: '⏰ Timeframe', value: this.config.timeframe, inline: true },
                        { name: '📈 Strategy', value: `MA(${this.config.ma1Period}) / MA(${this.config.ma2Period}) Crossover`, inline: false },
                        { name: '💰 Risk/Reward', value: `1:${this.config.riskRewardRatio}`, inline: true },
                        { name: '🌐 Dashboard', value: `http://localhost:${this.port}`, inline: true },
                        { name: '🔄 Check Interval', value: `${this.config.checkInterval / 1000} seconds`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Bot started successfully' });
                
                await channel.send({ embeds: [embed] });
            }
            
            this.config.isActive = true;
            await this.analyzeMarket();
            
            this.intervalId = setInterval(async () => {
                if (this.config.isActive) {
                    await this.analyzeMarket();
                }
            }, this.config.checkInterval);
            
            console.log('🚀 Bot is running and monitoring the market...');
            
        } catch (error) {
            console.error('❌ Error starting bot:', error.message);
            throw error;
        }
    }
    
    // Stop the bot
    async stopBot() {
        try {
            this.config.isActive = false;
            
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            
            if (this.discordReady && this.channelId) {
                const channel = await this.discordBot.channels.fetch(this.channelId);
                
                const embed = new EmbedBuilder()
                    .setTitle('🛑 Crypto Scalping Bot Stopped')
                    .setDescription('Bot has been stopped and is no longer monitoring the market')
                    .setColor(0xED4245)
                    .setTimestamp()
                    .setFooter({ text: 'Bot stopped' });
                
                await channel.send({ embeds: [embed] });
            }
            
            console.log('🛑 Bot stopped gracefully');
            
        } catch (error) {
            console.error('❌ Error stopping bot:', error.message);
            throw error;
        }
    }
    
    // Start Express server
    async startServer() {
        try {
            // Validate environment variables
            const requiredEnvVars = ['DISCORD_BOT_TOKEN', 'DISCORD_CHANNEL_ID'];
            const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
            
            if (missingVars.length > 0) {
                console.warn('⚠️ Missing Discord variables:', missingVars.join(', '));
                console.log('Bot will run without Discord notifications');
            } else {
                // Login Discord bot
                await this.discordBot.login(process.env.DISCORD_BOT_TOKEN);
                console.log('✅ Discord bot login initiated');
            }
            
            // Test exchange connection
            await this.exchange.loadMarkets();
            console.log('✅ Exchange connection verified');
            
            // Start Express server
            this.server = this.app.listen(this.port, () => {
                console.log(`🌐 Express server running on http://localhost:${this.port}`);
                console.log(`📊 Dashboard available at http://localhost:${this.port}`);
                console.log(`🔌 API endpoints available at http://localhost:${this.port}/api/`);
            });
            
        } catch (error) {
            console.error('❌ Error starting server:', error.message);
            throw error;
        }
    }
    
    // Graceful shutdown
    async shutdown() {
        try {
            console.log('🛑 Shutting down gracefully...');
            
            if (this.config.isActive) {
                await this.stopBot();
            }
            
            if (this.server) {
                this.server.close();
            }
            
            console.log('✅ Shutdown complete');
            process.exit(0);
            
        } catch (error) {
            console.error('❌ Error during shutdown:', error.message);
            process.exit(1);
        }
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    if (global.bot) {
        await global.bot.shutdown();
    } else {
        process.exit(0);
    }
});

process.on('SIGTERM', async () => {
    if (global.bot) {
        await global.bot.shutdown();
    } else {
        process.exit(0);
    }
});

// Main execution
async function main() {
    try {
        global.bot = new CryptoScalpingBot();
        await global.bot.startServer();
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Start the application
if (require.main === module) {
    main();
}

module.exports = CryptoScalpingBot;