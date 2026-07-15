package com.aerokitten.bot.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

public class BotConfig {
    private static final Path CONFIG_PATH = Path.of("config", "aerokitten-bot.json");
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private String serverAddress = "aero.justaprinter.me";
    private int serverPort = 25565;
    private boolean autoConnect = false;
    private int reconnectDelaySeconds = 30;
    private int antiAfkIntervalSeconds = 60;
    private int apiPort = 3478;
    private boolean debug = true;

    public static BotConfig load() {
        BotConfig config = new BotConfig();
        if (Files.exists(CONFIG_PATH)) {
            try (Reader reader = Files.newBufferedReader(CONFIG_PATH)) {
                JsonObject json = JsonParser.parseReader(reader).getAsJsonObject();
                if (json.has("server_address")) config.serverAddress = json.get("server_address").getAsString();
                if (json.has("server_port")) config.serverPort = json.get("server_port").getAsInt();
                if (json.has("auto_connect")) config.autoConnect = json.get("auto_connect").getAsBoolean();
                if (json.has("reconnect_delay_seconds")) config.reconnectDelaySeconds = json.get("reconnect_delay_seconds").getAsInt();
                if (json.has("anti_afk_interval_seconds")) config.antiAfkIntervalSeconds = json.get("anti_afk_interval_seconds").getAsInt();
                if (json.has("api_port")) config.apiPort = json.get("api_port").getAsInt();
                if (json.has("debug")) config.debug = json.get("debug").getAsBoolean();
            } catch (Exception e) {
                System.err.println("[AeroKittenBot] Failed to load config: " + e.getMessage());
            }
        }
        save(config);
        return config;
    }

    private static void save(BotConfig config) {
        try {
            Files.createDirectories(CONFIG_PATH.getParent());
            JsonObject json = new JsonObject();
            json.addProperty("server_address", config.serverAddress);
            json.addProperty("server_port", config.serverPort);
            json.addProperty("auto_connect", config.autoConnect);
            json.addProperty("reconnect_delay_seconds", config.reconnectDelaySeconds);
            json.addProperty("anti_afk_interval_seconds", config.antiAfkIntervalSeconds);
            json.addProperty("api_port", config.apiPort);
            json.addProperty("debug", config.debug);
            try (Writer writer = Files.newBufferedWriter(CONFIG_PATH)) {
                GSON.toJson(json, writer);
            }
        } catch (IOException e) {
            System.err.println("[AeroKittenBot] Failed to save config: " + e.getMessage());
        }
    }

    public String serverAddress() { return serverAddress; }
    public int serverPort() { return serverPort; }
    public boolean autoConnect() { return autoConnect; }
    public int reconnectDelaySeconds() { return reconnectDelaySeconds; }
    public int antiAfkIntervalSeconds() { return antiAfkIntervalSeconds; }
    public int apiPort() { return apiPort; }
    public boolean debug() { return debug; }
}
