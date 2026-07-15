package com.aerokitten.bot.client;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

public class BotController implements Runnable {
    private final BotClient botClient;
    private final int port;
    private final Gson gson = new Gson();
    private volatile boolean running = true;

    private ServerSocket serverSocket;
    private Socket clientSocket;
    private PrintWriter writer;
    private Thread serverThread;
    private final BlockingQueue<String> outgoingEvents = new LinkedBlockingQueue<>();

    public BotController(BotClient botClient, int port) {
        this.botClient = botClient;
        this.port = port;
    }

    public void start() {
        serverThread = new Thread(this, "BotController");
        serverThread.setDaemon(true);
        serverThread.start();
    }

    @Override
    public void run() {
        try {
            serverSocket = new ServerSocket(port, 1);
            botClient.log("API server listening on port " + port);

            while (running) {
                try {
                    clientSocket = serverSocket.accept();
                    botClient.log("Control client connected from " + clientSocket.getInetAddress());

                    writer = new PrintWriter(clientSocket.getOutputStream(), true);
                    BufferedReader reader = new BufferedReader(new InputStreamReader(clientSocket.getInputStream()));

                    Thread eventSender = new Thread(() -> {
                        try {
                            while (running && clientSocket != null && !clientSocket.isClosed()) {
                                String event = outgoingEvents.take();
                                if (writer != null) {
                                    writer.println(event);
                                }
                            }
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                    }, "EventSender");
                    eventSender.setDaemon(true);
                    eventSender.start();

                    String line;
                    while (running && (line = reader.readLine()) != null) {
                        processCommand(line.trim());
                    }
                } catch (IOException e) {
                    if (running) {
                        botClient.log("Controller connection error: " + e.getMessage());
                    }
                } finally {
                    closeClient();
                }
            }
        } catch (IOException e) {
            if (running) {
                botClient.log("Failed to start API server: " + e.getMessage());
            }
        }
    }

    private void processCommand(String json) {
        try {
            JsonObject cmd = gson.fromJson(json, JsonObject.class);
            if (cmd == null || !cmd.has("cmd")) return;

            String type = cmd.get("cmd").getAsString();
            switch (type) {
                case "connect" -> {
                    String host = cmd.has("host") ? cmd.get("host").getAsString() : botClient.getConfig().serverAddress();
                    int port2 = cmd.has("port") ? cmd.get("port").getAsInt() : botClient.getConfig().serverPort();
                    botClient.connect(host, port2);
                }
                case "disconnect" -> botClient.disconnect();
                case "say" -> {
                    if (cmd.has("message")) botClient.sendChat(cmd.get("message").getAsString());
                }
                case "move_to" -> {
                    int x = cmd.get("x").getAsInt();
                    int z = cmd.get("z").getAsInt();
                    botClient.getMovementController().moveTo(x, z,
                        res -> sendEvent("move_complete", "x", String.valueOf(x), "z", String.valueOf(z), "result", res),
                        err -> sendEvent("move_error", "x", String.valueOf(x), "z", String.valueOf(z), "error", err)
                    );
                }
                case "follow" -> {
                    if (cmd.has("player")) botClient.getMovementController().followPlayer(cmd.get("player").getAsString());
                }
                case "stop" -> botClient.getMovementController().stop();
                case "look_at" -> {
                    if (cmd.has("player")) {
                        botClient.lookAtPlayer(cmd.get("player").getAsString());
                    } else if (cmd.has("x") && cmd.has("z")) {
                        int y = cmd.has("y") ? cmd.get("y").getAsInt() :
                            (int) (botClient.getMc().player != null ? botClient.getMc().player.getY() : 64);
                        botClient.lookAt(cmd.get("x").getAsInt(), y, cmd.get("z").getAsInt());
                    }
                }
                case "scan" -> {
                    int radius = cmd.has("radius") ? cmd.get("radius").getAsInt() : 10;
                    var result = botClient.getWorldScanner().scanSurroundings(radius);
                    sendEvent("scan_result", result);
                }
                case "status" -> {
                    var status = new JsonObject();
                    status.addProperty("connected", botClient.isConnected());
                    status.addProperty("moving", botClient.getMovementController().isMoving());
                    status.addProperty("following", botClient.getMovementController().isFollowing());
                    status.addProperty("follow_target", botClient.getMovementController().getFollowTarget());
                    status.add("position", botClient.getWorldScanner().getPosition());
                    status.addProperty("server", botClient.getCurrentServer());
                    sendEvent("status_report", status);
                }
                case "inventory" -> {
                    var inv = botClient.getInventory();
                    sendEvent("inventory_report", inv);
                }
                default -> sendEvent("error", "message", "Unknown command: " + type);
            }
        } catch (Exception e) {
            sendEvent("error", "message", "Failed to parse command: " + e.getMessage());
        }
    }

    public void sendEvent(String event, JsonObject data) {
        JsonObject msg = new JsonObject();
        msg.addProperty("event", event);
        msg.add("data", data);
        outgoingEvents.offer(msg.toString());
    }

    public void sendEvent(String event, String... keyValues) {
        JsonObject data = new JsonObject();
        for (int i = 0; i < keyValues.length; i += 2) {
            if (i + 1 < keyValues.length) {
                data.addProperty(keyValues[i], keyValues[i + 1]);
            }
        }
        sendEvent(event, data);
    }

    private void closeClient() {
        try {
            if (writer != null) writer.close();
            if (clientSocket != null && !clientSocket.isClosed()) clientSocket.close();
        } catch (IOException ignored) {}
        writer = null;
        clientSocket = null;
    }

    public void shutdown() {
        running = false;
        closeClient();
        try {
            if (serverSocket != null && !serverSocket.isClosed()) serverSocket.close();
        } catch (IOException ignored) {}
    }
}
