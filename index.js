import scheduleNextRun from "./schedule.js";
import axios from "axios";
import { promises as fs } from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";

const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    reset: "\x1b[0m",
};

class PawsGameBot {
    constructor() {
        this.token = "";
        this.data = [];
        this.proxies = [];
        this.currentDataIndex = 0;
        this.currentProxyIndex = 0;
        this.userData = null;
    }

    log(message, color = colors.reset) {
        console.log(`${color}${message}${colors.reset}`);
    }

    async initialize() {
        try {
            const [dataContent, proxyContent] = await Promise.all([
                fs.readFile("data.txt", "utf8"),
                fs.readFile("proxy.txt", "utf8").catch(() => ""),
            ]);

            this.data = dataContent.split("\n").filter((line) => line.trim());
            this.proxies = proxyContent.split("\n").filter((line) => line.trim());

            this.log("Bot initialized successfully", colors.green);
        } catch (error) {
            this.log(`Error initializing bot: ${error.message}`, colors.red);
            throw error;
        }
    }

    getNextData() {
        const data = this.data[this.currentDataIndex];
        this.currentDataIndex = (this.currentDataIndex + 1) % this.data.length;
        return data;
    }
    getProxyForQueryId(queryId) {
        if (this.proxies.length === 0) return null;
        const index = queryId.charCodeAt(0) % this.proxies.length;
        return this.proxies[index];
    }

    async makeRequest(method, url, data = null, queryId = null) {
        const config = {
            method,
            url,
            headers: {
                "sec-ch-ua":
                    '"Chromium";v="130", "Microsoft Edge";v="130", "Not?A_Brand";v="99", "Microsoft Edge WebView2";v="130"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
            },
        };

        if (this.token) {
            config.headers.authorization = `Bearer ${this.token}`;
        }

        if (data) {
            config.data = data;
        }

        const proxy = queryId ? this.getProxyForQueryId(queryId) : null;

        if (proxy) {
            this.log(`Using proxy: ${proxy}`, colors.magenta);
            const proxyUrl = proxy.startsWith("http") ? proxy : `http://${proxy}`;

            config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            this.log(`Request error: ${error.message}`, colors.red);
            throw error;
        }
    }

    async authenticate() {
        try {
            const authData = {
                data: this.getNextData(),
            };

            const response = await this.makeRequest(
                "POST",
                "https://api.paws.community/v1/user/auth",
                authData,
                authData.data
            );

            if (response.success && response.data[0]) {
                this.token = response.data[0];
                this.userData = response.data[1];

                this.log(
                    `User: ${this.userData.userData.username} | Balance: ${this.userData.gameData.balance}`,
                    colors.magenta
                );
                this.log("Authentication successful", colors.green);
                return true;
            }

            this.log("Authentication failed", colors.red);
            return false;
        } catch (error) {
            this.log(`Authentication error: ${error.message}`, colors.red);
            return false;
        }
    }

    async getQuests() {
        try {
            const response = await this.makeRequest("GET", "https://api.paws.community/v1/quests/list");
            return response.data;
        } catch (error) {
            this.log(`Error getting quests: ${error.message}`, colors.red);
            return [];
        }
    }

    async completeQuest(questId) {
        try {
            const response = await this.makeRequest(
                "POST",
                "https://api.paws.community/v1/quests/completed",
                {
                    questId,
                },
                questId
            );
            return response.success;
        } catch (error) {
            this.log(`Error completing quest ${questId}: ${error.message}`, colors.red);
            return false;
        }
    }

    async claimQuest(questId) {
        try {
            const response = await this.makeRequest(
                "POST",
                "https://api.paws.community/v1/quests/claim",
                {
                    questId,
                },
                questId
            );
            return response.success;
        } catch (error) {
            this.log(`Error claiming quest ${questId}: ${error.message}`, colors.red);
            return false;
        }
    }

    async processQuests() {
        try {
            const quests = await this.getQuests();

            for (const quest of quests) {
                if (
                    !quest.progress.claimed &&
                    quest._id != "6714e8b80f93ce482efae727" &&
                    quest._id != "671b8ecb22d15820f13dc61a" &&
                    quest._id != "671b8ee422d15820f13dc61d"
                ) {
                    this.log(`Processing quest: ${quest.title}`, colors.yellow);

                    const completed = await this.completeQuest(quest._id);
                    if (completed) {
                        this.log(`Completed quest: ${quest.title}`, colors.green);

                        const claimed = await this.claimQuest(quest._id);
                        if (claimed) {
                            this.log(`Claimed reward for quest: ${quest.title}`, colors.green);
                        }
                    }

                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        } catch (error) {
            this.log(`Error processing quests: ${error.message}`, colors.red);
        }
    }

    async start() {
        try {
            await this.initialize();
            const authenticated = await this.authenticate();

            if (authenticated) {
                await this.processQuests();
                this.log("Bot finished successfully", colors.green);
            } else {
                this.log("Bot failed to authenticate", colors.red);
            }

            scheduleNextRun(12, () => this.start());
        } catch (error) {
            this.log(`Bot error: ${error.message}`, colors.red);
        }
    }
}

const bot = new PawsGameBot();
bot.start();
