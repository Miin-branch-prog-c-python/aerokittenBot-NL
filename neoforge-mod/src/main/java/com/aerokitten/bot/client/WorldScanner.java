package com.aerokitten.bot.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

import java.util.List;

public class WorldScanner {
    private final Minecraft mc;

    public WorldScanner() {
        this.mc = Minecraft.getInstance();
    }

    public JsonObject scanSurroundings(int radius) {
        JsonObject result = new JsonObject();
        if (mc.level == null || mc.player == null) {
            result.addProperty("error", "World or player not loaded");
            return result;
        }

        result.addProperty("x", mc.player.getX());
        result.addProperty("y", mc.player.getY());
        result.addProperty("z", mc.player.getZ());
        result.addProperty("dimension", mc.level.dimension().location().toString());

        result.add("blocks", scanBlocks(radius));
        result.add("players", scanPlayers(radius));
        result.add("entities", scanEntities(radius));

        return result;
    }

    public JsonObject scanBlock(int x, int y, int z) {
        JsonObject result = new JsonObject();
        if (mc.level == null) {
            result.addProperty("error", "World not loaded");
            return result;
        }
        BlockPos pos = new BlockPos(x, y, z);
        if (!mc.level.isLoaded(pos)) {
            result.addProperty("error", "Position not loaded");
            return result;
        }
        BlockState state = mc.level.getBlockState(pos);
        result.addProperty("x", x);
        result.addProperty("y", y);
        result.addProperty("z", z);
        result.addProperty("block", BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
        result.addProperty("block_name", state.getBlock().getDescriptionId());
        result.addProperty("solid", state.isSolid());
        result.addProperty("air", state.isAir());
        return result;
    }

    public JsonObject getPosition() {
        JsonObject result = new JsonObject();
        if (mc.player == null) {
            result.addProperty("error", "Player not loaded");
            return result;
        }
        Vec3 pos = mc.player.position();
        result.addProperty("x", pos.x);
        result.addProperty("y", pos.y);
        result.addProperty("z", pos.z);
        result.addProperty("yaw", mc.player.getYRot());
        result.addProperty("pitch", mc.player.getXRot());
        result.addProperty("health", mc.player.getHealth());
        result.addProperty("hunger", mc.player.getFoodData().getFoodLevel());
        if (mc.level != null) {
            result.addProperty("dimension", mc.level.dimension().location().toString());
        }
        return result;
    }

    private JsonArray scanBlocks(int radius) {
        JsonArray blocks = new JsonArray();
        if (mc.level == null || mc.player == null) return blocks;

        BlockPos center = BlockPos.containing(mc.player.position());
        int count = 0;
        for (int x = center.getX() - radius; x <= center.getX() + radius && count < 500; x++) {
            for (int y = center.getY() - 3; y <= center.getY() + 3 && count < 500; y++) {
                for (int z = center.getZ() - radius; z <= center.getZ() + radius && count < 500; z++) {
                    BlockPos pos = new BlockPos(x, y, z);
                    if (!mc.level.isLoaded(pos)) continue;
                    BlockState state = mc.level.getBlockState(pos);
                    if (!state.isAir()) {
                        JsonObject block = new JsonObject();
                        block.addProperty("x", x);
                        block.addProperty("y", y);
                        block.addProperty("z", z);
                        block.addProperty("name", state.getBlock().getDescriptionId());
                        block.addProperty("solid", state.isSolid());
                        blocks.add(block);
                        count++;
                    }
                }
            }
        }
        return blocks;
    }

    private JsonArray scanPlayers(int radius) {
        JsonArray players = new JsonArray();
        if (mc.level == null || mc.player == null) return players;

        AABB box = mc.player.getBoundingBox().inflate(radius);
        var nearby = mc.level.getEntitiesOfClass(AbstractClientPlayer.class, box);
        for (var p : nearby) {
            if (p.equals(mc.player)) continue;
            JsonObject player = new JsonObject();
            player.addProperty("name", p.getName().getString());
            player.addProperty("uuid", p.getUUID().toString());
            player.addProperty("x", p.getX());
            player.addProperty("y", p.getY());
            player.addProperty("z", p.getZ());
            player.addProperty("distance", Math.round(mc.player.distanceTo(p) * 10.0) / 10.0);
            players.add(player);
        }
        return players;
    }

    private JsonArray scanEntities(int radius) {
        JsonArray entities = new JsonArray();
        if (mc.level == null || mc.player == null) return entities;

        AABB box = mc.player.getBoundingBox().inflate(radius);
        List<Entity> nearby = mc.level.getEntities(mc.player, box);
        int count = 0;
        for (Entity e : nearby) {
            if (e instanceof Player) continue;
            if (count++ >= 30) break;
            JsonObject entity = new JsonObject();
            entity.addProperty("name", e.getName().getString());
            entity.addProperty("type", e.getType().getDescriptionId());
            entity.addProperty("uuid", e.getUUID().toString());
            entity.addProperty("x", e.getX());
            entity.addProperty("y", e.getY());
            entity.addProperty("z", e.getZ());
            entity.addProperty("distance", Math.round(mc.player.distanceTo(e) * 10.0) / 10.0);
            entities.add(entity);
        }
        return entities;
    }

    public double getHealth() {
        return mc.player != null ? mc.player.getHealth() : 0;
    }

    public int getFoodLevel() {
        return mc.player != null ? mc.player.getFoodData().getFoodLevel() : 0;
    }
}
