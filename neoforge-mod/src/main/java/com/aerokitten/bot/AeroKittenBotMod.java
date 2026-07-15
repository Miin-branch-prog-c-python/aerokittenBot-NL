package com.aerokitten.bot;

import com.aerokitten.bot.client.BotClient;
import com.aerokitten.bot.client.StdioCommandReader;
import com.aerokitten.bot.config.BotConfig;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.common.NeoForge;

@Mod(value = AeroKittenBotMod.MOD_ID, dist = Dist.CLIENT)
public class AeroKittenBotMod {
    public static final String MOD_ID = "aerokitten_bot";
    private static AeroKittenBotMod instance;

    private BotConfig config;
    private BotClient botClient;

    public AeroKittenBotMod(IEventBus modBus) {
        instance = this;
        if (FMLEnvironment.dist == Dist.CLIENT) {
            initClient();
        }
    }

    private void initClient() {
        config = BotConfig.load();
        botClient = new BotClient(config);
        NeoForge.EVENT_BUS.register(botClient);

        botClient.init();

        StdioCommandReader cmdReader = new StdioCommandReader(botClient);
        Thread stdioThread = new Thread(cmdReader, "STDIN Reader");
        stdioThread.setDaemon(true);
        stdioThread.start();

        if (config.autoConnect()) {
            new Thread(() -> {
                try { Thread.sleep(3000); } catch (InterruptedException ignored) {}
                botClient.connect();
            }, "AutoConnect").start();
        }

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (botClient != null) botClient.shutdown();
        }, "Shutdown"));

        botClient.log("AeroKitten Bot initialized (API port: " + config.apiPort() + ")");
    }

    public static AeroKittenBotMod getInstance() { return instance; }
    public BotClient getBotClient() { return instance.botClient; }
    public BotConfig getConfig() { return instance.config; }
}
