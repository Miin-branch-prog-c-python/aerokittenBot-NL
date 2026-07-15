package com.aerokitten.bot.client;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.Locale;

public class StdioCommandReader implements Runnable {
    private final BotClient botClient;
    private volatile boolean running = true;

    public StdioCommandReader(BotClient botClient) {
        this.botClient = botClient;
    }

    @Override
    public void run() {
        botClient.log("STDIN command reader started (type 'help' for commands)");

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
            String line;
            while (running && (line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty()) continue;
                processCommand(line);
            }
        } catch (Exception e) {
            if (running) {
                botClient.log("STDIN error: " + e.getMessage());
            }
        }
    }

    private void processCommand(String input) {
        String[] parts = input.split(" ", 2);
        String command = parts[0].toLowerCase(Locale.ROOT).replaceFirst("^/", "");
        String args = parts.length > 1 ? parts[1] : "";

        switch (command) {
            case "say" -> {
                if (args.isEmpty()) botClient.log("Usage: say <message>");
                else botClient.sendChat(args);
            }
            case "connect" -> botClient.connect();
            case "disconnect" -> botClient.disconnect();
            case "move" -> {
                String[] coords = args.split(" ");
                if (coords.length >= 2) {
                    try {
                        int x = Integer.parseInt(coords[0]);
                        int z = Integer.parseInt(coords[1]);
                        int y = coords.length >= 3 ? Integer.parseInt(coords[2]) : -1;
                        if (y == -1) botClient.getMovementController().moveTo(x, z, null, null);
                        else botClient.getMovementController().moveTo(x, y, z, null, null);
                    } catch (NumberFormatException e) {
                        botClient.log("Usage: move <x> <z> [y]");
                    }
                }
            }
            case "follow" -> {
                if (args.isEmpty()) botClient.log("Usage: follow <player>");
                else botClient.getMovementController().followPlayer(args);
            }
            case "stop" -> botClient.getMovementController().stop();
            case "look" -> {
                String[] coords = args.split(" ");
                if (coords.length >= 2) {
                    try {
                        int x = Integer.parseInt(coords[0]);
                        int z = Integer.parseInt(coords[1]);
                        int y = coords.length >= 3 ? Integer.parseInt(coords[2]) : 64;
                        botClient.lookAt(x, y, z);
                    } catch (NumberFormatException e) {
                        botClient.log("Usage: look <x> <z> [y]");
                    }
                }
            }
            case "scan" -> {
                int radius = 10;
                if (!args.isEmpty()) {
                    try { radius = Integer.parseInt(args); } catch (NumberFormatException ignored) {}
                }
                var result = botClient.getWorldScanner().scanSurroundings(radius);
                botClient.log("Scan result: " + result.toString());
            }
            case "pos" -> {
                var pos = botClient.getWorldScanner().getPosition();
                botClient.log("Position: " + pos.toString());
            }
            case "reconnect" -> {
                botClient.disconnect();
                try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
                botClient.connect();
            }
            case "quit" -> {
                botClient.log("Shutting down...");
                running = false;
                botClient.shutdown();
                System.exit(0);
            }
            case "help" -> {
                botClient.log("=== AeroKitten Bot Commands ===");
                botClient.log("say <msg>       - Send a chat message");
                botClient.log("connect         - Connect to configured server");
                botClient.log("disconnect      - Disconnect from server");
                botClient.log("move <x> <z> [y] - Move to coordinates");
                botClient.log("follow <player> - Follow a player");
                botClient.log("stop            - Stop moving");
                botClient.log("look <x> <z> [y] - Look at coordinates");
                botClient.log("scan [radius]   - Scan surroundings");
                botClient.log("pos             - Show current position");
                botClient.log("status          - Show connection status");
                botClient.log("reconnect       - Force reconnection");
                botClient.log("quit            - Shutdown");
            }
            case "status" -> {
                botClient.log("Connected: " + botClient.isConnected());
                botClient.log("Moving: " + botClient.getMovementController().isMoving());
                botClient.log("Following: " + botClient.getMovementController().isFollowing());
            }
            default -> botClient.log("Unknown command: " + command + " (type 'help')");
        }
    }

    public void stop() { running = false; }
}
