package com.aerokitten.bot.client;

import com.aerokitten.bot.config.BotConfig;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.multiplayer.TransferState;
import net.minecraft.network.chat.Component;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public class BotClient {
    private final BotConfig config;
    private final Minecraft mc;
    private boolean connected = false;
    private boolean connectScheduled = false;
    private boolean shouldReconnect = true;
    private long lastReconnectAttempt = 0;
    private String currentServer = "";

    private MovementController movementController;
    private WorldScanner worldScanner;
    private BotController controller;

    public BotClient(BotConfig config) {
        this.config = config;
        this.mc = Minecraft.getInstance();
    }

    public void init() {
        this.worldScanner = new WorldScanner();
        this.movementController = new MovementController(this);
        this.controller = new BotController(this, config.apiPort());
        this.controller.start();
    }

    public void connect() {
        connect(config.serverAddress(), config.serverPort());
    }

    public void connect(String host, int port) {
        if (connected || mc.getConnection() != null) {
            log("Already connected");
            return;
        }
        connectScheduled = true;
        currentServer = host + ":" + port;
        mc.execute(() -> {
            try {
                String addressStr = host + ":" + port;
                ServerAddress address = ServerAddress.parseString(addressStr);
                ServerData serverData = new ServerData(host, addressStr, ServerData.Type.OTHER);
                ConnectScreen.startConnecting(new TitleScreen(), mc, address, serverData, false, null);
                log("Connecting to " + addressStr + "...");
                sendEvent("connecting", "server", addressStr);
            } catch (Exception e) {
                log("Failed to connect: " + e.getMessage());
                connectScheduled = false;
                sendEvent("error", "message", "Connection failed: " + e.getMessage());
            }
        });
    }

    @SubscribeEvent
    public void onPlayerLogsIn(ClientPlayerNetworkEvent.LoggingIn event) {
        connected = true;
        shouldReconnect = true;
        connectScheduled = false;
        log("Connected to " + currentServer);
        sendEvent("connected", "server", currentServer);
    }

    @SubscribeEvent
    public void onPlayerLogsOut(ClientPlayerNetworkEvent.LoggingOut event) {
        connected = false;
        log("Disconnected from " + currentServer);
        sendEvent("disconnected", "reason", "Connection closed");
        if (shouldReconnect) {
            scheduleReconnect();
        }
    }

    @SubscribeEvent
    public void onClientTick(ClientTickEvent.Pre event) {
        if (!connected || mc.player == null) return;

        movementController.tick();
    }

    private void scheduleReconnect() {
        if (!shouldReconnect || connectScheduled) return;
        long now = System.currentTimeMillis();
        if (now - lastReconnectAttempt < config.reconnectDelaySeconds() * 1000L) return;
        lastReconnectAttempt = now;
        new Thread(() -> {
            try {
                int delay = config.reconnectDelaySeconds();
                log("Reconnecting in " + delay + "s...");
                Thread.sleep(delay * 1000L);
            } catch (InterruptedException e) { return; }
            if (!connected && shouldReconnect) {
                connect();
            }
        }, "Reconnect").start();
    }

    public void sendChat(String message) {
        if (mc.player != null && mc.player.connection != null) {
            mc.execute(() -> mc.player.connection.sendChat(message));
            log("Sent: " + message);
        } else {
            log("Cannot send message: not connected");
            sendEvent("error", "message", "Not connected, cannot send message");
        }
    }

    public void lookAt(int x, int y, int z) {
        if (mc.player == null) return;
        double dx = x + 0.5 - mc.player.getX();
        double dy = y - (mc.player.getY() + 1.5);
        double dz = z + 0.5 - mc.player.getZ();
        double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist == 0) return;

        float yaw = (float) Math.toDegrees(Math.atan2(-dx, dz));
        final float pitch = Math.max(-90, Math.min(90,
            (float) -Math.toDegrees(Math.asin(dy / dist))));

        mc.execute(() -> {
            mc.player.setYRot(yaw);
            mc.player.setXRot(pitch);
        });
    }

    public void lookAtPlayer(String playerName) {
        if (mc.level == null || mc.player == null) return;
        mc.level.players().stream()
            .filter(p -> p.getName().getString().equals(playerName))
            .findFirst()
            .ifPresent(player -> lookAt((int) player.getX(), (int) (player.getY() + 1), (int) player.getZ()));
    }

    public JsonObject getInventory() {
        JsonObject result = new JsonObject();
        if (mc.player == null) {
            result.addProperty("error", "Player not loaded");
            return result;
        }

        List<JsonObject> items = new ArrayList<>();
        var container = mc.player.getInventory();
        for (int i = 0; i < container.getContainerSize(); i++) {
            ItemStack stack = container.getItem(i);
            if (!stack.isEmpty()) {
                JsonObject item = new JsonObject();
                item.addProperty("slot", i);
                item.addProperty("name", stack.getDisplayName().getString());
                item.addProperty("count", stack.getCount());
                item.addProperty("id", stack.getItem().getDescriptionId());
                items.add(item);
            }
        }
        var arr = new com.google.gson.JsonArray();
        for (var item : items) arr.add(item);
        result.add("items", arr);
        return result;
    }

    public void disconnect() {
        shouldReconnect = false;
        connectScheduled = false;
        movementController.stop();
        if (mc.getConnection() != null) {
            mc.execute(() -> mc.getConnection().disconnect(Component.literal("Bot shutdown")));
        } else {
            connected = false;
        }
    }

    public void shutdown() {
        shouldReconnect = false;
        if (controller != null) controller.shutdown();
        disconnect();
    }

    public void sendEvent(String event, String... keyValues) {
        if (controller != null) {
            controller.sendEvent(event, keyValues);
        }
    }

    public void sendEvent(String event, JsonObject data) {
        if (controller != null) {
            controller.sendEvent(event, data);
        }
    }

    // Getters
    public boolean isConnected() { return connected; }
    public String getCurrentServer() { return currentServer; }
    public BotConfig getConfig() { return config; }
    public Minecraft getMc() { return mc; }
    public MovementController getMovementController() { return movementController; }
    public WorldScanner getWorldScanner() { return worldScanner; }

    public void log(String message) {
        System.out.println("[AeroKittenBot] " + message);
    }
}
