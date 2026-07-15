package com.aerokitten.bot.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.util.*;
import java.util.function.Consumer;

public class MovementController {
    private final Minecraft mc;
    private final BotClient botClient;

    private Deque<BlockPos> path = new ArrayDeque<>();
    private BlockPos target = null;
    private boolean moving = false;
    private boolean following = false;
    private String followTarget = null;
    private Consumer<String> onComplete;
    private Consumer<String> onFail;

    private static final int MAX_PATH_LENGTH = 5000;
    private static final double REACH_DISTANCE = 0.6;
    private static final double SPEED = 0.4;

    public MovementController(BotClient botClient) {
        this.mc = Minecraft.getInstance();
        this.botClient = botClient;
    }

    public void moveTo(int x, int y, int z, Consumer<String> onComplete, Consumer<String> onFail) {
        stop();
        this.target = new BlockPos(x, y, z);
        this.onComplete = onComplete;
        this.onFail = onFail;
        findPath();
    }

    public void moveTo(int x, int z, Consumer<String> onComplete, Consumer<String> onFail) {
        if (mc.player == null) { onFail.accept("Player not loaded"); return; }
        int y = findGroundY(new BlockPos(x, (int)mc.player.getY(), z));
        moveTo(x, y, z, onComplete, onFail);
    }

    public void followPlayer(String playerName) {
        this.following = true;
        this.followTarget = playerName;
        this.onComplete = msg -> {};
        this.onFail = msg -> {};
        botClient.log("Following player: " + playerName);
    }

    public void stop() {
        moving = false;
        following = false;
        followTarget = null;
        if (path != null) path.clear();
        target = null;
        if (mc.player != null) {
            mc.player.xxa = 0;
            mc.player.zza = 0;
            mc.player.setJumping(false);
        }
    }

    public void tick() {
        if (mc.player == null) return;

        if (following && followTarget != null) {
            var level = mc.level;
            if (level != null) {
                var player = level.players().stream()
                    .filter(p -> p.getName().getString().equals(followTarget))
                    .findFirst().orElse(null);
                if (player != null) {
                    Vec3 pos = player.position();
                    BlockPos fp = BlockPos.containing(pos);
                    if (target == null || !target.equals(fp)) {
                        findPathToPlayer(fp);
                    }
                }
            }
        }

        if (!moving || path == null || path.isEmpty()) {
            if (mc.player.xxa != 0 || mc.player.zza != 0) {
                mc.player.xxa = 0;
                mc.player.zza = 0;
            }
            return;
        }

        BlockPos next = path.peekFirst();
        if (next == null) return;

        Vec3 currentPos = mc.player.position();
        double dx = next.getX() + 0.5 - currentPos.x;
        double dz = next.getZ() + 0.5 - currentPos.z;
        double dist = Math.sqrt(dx * dx + dz * dz);

        double targetY = next.getY();
        double dy = targetY - currentPos.y;

        if (dist < REACH_DISTANCE && Math.abs(dy) < 0.3) {
            path.pollFirst();
            botClient.sendEvent("move_step",
                "x", Integer.toString(next.getX()),
                "y", Integer.toString(next.getY()),
                "z", Integer.toString(next.getZ()));
            if (path.isEmpty()) {
                moving = false;
                mc.player.xxa = 0;
                mc.player.zza = 0;
                mc.player.setJumping(false);
                if (onComplete != null) onComplete.accept("Reached destination");
                botClient.sendEvent("move_end",
                    "x", Integer.toString(target.getX()),
                    "y", Integer.toString(target.getY()),
                    "z", Integer.toString(target.getZ()));
            }
            return;
        }

        double yaw = Math.toDegrees(Math.atan2(-dx, dz));
        mc.player.setYRot((float) yaw);

        if (dy > 0.3 && mc.player.onGround()) {
            mc.player.setJumping(true);
        }

        mc.player.xxa = 0;
        mc.player.zza = (float) SPEED;
    }

    private void findPath() {
        if (mc.level == null || mc.player == null) {
            if (onFail != null) onFail.accept("World not loaded");
            return;
        }

        BlockPos start = BlockPos.containing(mc.player.position());
        if (target == null) return;

        if (start.equals(target)) {
            if (onComplete != null) onComplete.accept("Already at destination");
            return;
        }

        var aStar = new AStarPathfinder(mc.level, start, target, MAX_PATH_LENGTH);
        List<BlockPos> result = aStar.find();
        if (result.isEmpty()) {
            if (onFail != null) onFail.accept("No path found");
            botClient.sendEvent("move_fail", "reason", "No path found");
            return;
        }

        path = new ArrayDeque<>(result);
        moving = true;
        botClient.sendEvent("move_start",
            "x", Integer.toString(target.getX()),
            "y", Integer.toString(target.getY()),
            "z", Integer.toString(target.getZ()));
    }

    private void findPathToPlayer(BlockPos playerPos) {
        if (mc.level == null || mc.player == null) return;
        BlockPos botPos = BlockPos.containing(mc.player.position());
        int dx = Math.abs(botPos.getX() - playerPos.getX());
        int dz = Math.abs(botPos.getZ() - playerPos.getZ());
        if (dx <= 2 && dz <= 2) return;

        var aStar = new AStarPathfinder(mc.level, botPos, playerPos, MAX_PATH_LENGTH);
        List<BlockPos> result = aStar.find();
        if (!result.isEmpty()) {
            path = new ArrayDeque<>(result);
            moving = true;
        }
    }

    private int findGroundY(BlockPos pos) {
        if (mc.level == null) return pos.getY();
        Level level = mc.level;
        int y = pos.getY();
        for (int i = 0; i < 20; i++) {
            BlockState state = level.getBlockState(new BlockPos(pos.getX(), y, pos.getZ()));
            BlockState above = level.getBlockState(new BlockPos(pos.getX(), y + 1, pos.getZ()));
            if (!state.isAir() && above.isAir()) return y + 1;
            y--;
        }
        return pos.getY();
    }

    public boolean isMoving() { return moving; }
    public boolean isFollowing() { return following; }
    public String getFollowTarget() { return followTarget; }

    public void stopFollowing() {
        following = false;
        followTarget = null;
    }

    // ---- A* Pathfinder ----
    static class AStarPathfinder {
        private final Level level;
        private final BlockPos start;
        private final BlockPos goal;
        private final int maxNodes;

        AStarPathfinder(Level level, BlockPos start, BlockPos goal, int maxNodes) {
            this.level = level;
            this.start = start;
            this.goal = goal;
            this.maxNodes = maxNodes;
        }

        List<BlockPos> find() {
            var open = new PriorityQueue<Node>(Comparator.comparingInt(n -> n.f));
            var closed = new HashSet<BlockPos>();
            var cameFrom = new HashMap<BlockPos, BlockPos>();
            var gScore = new HashMap<BlockPos, Integer>();

            Node startNode = new Node(start, 0, heuristic(start));
            open.add(startNode);
            gScore.put(start, 0);

            int iterations = 0;
            while (!open.isEmpty() && iterations < maxNodes) {
                Node current = open.poll();
                iterations++;

                if (current.pos.equals(goal) || current.pos.distSqr(goal) <= 1) {
                    return reconstructPath(cameFrom, current.pos);
                }

                closed.add(current.pos);

                for (BlockPos neighbor : getNeighbors(current.pos)) {
                    if (closed.contains(neighbor)) continue;

                    int tentativeG = gScore.getOrDefault(current.pos, 0) + 1;
                    if (neighbor.getY() != current.pos.getY()) tentativeG += 2;

                    if (tentativeG >= gScore.getOrDefault(neighbor, Integer.MAX_VALUE)) continue;

                    cameFrom.put(neighbor, current.pos);
                    gScore.put(neighbor, tentativeG);
                    int f = tentativeG + heuristic(neighbor);
                    open.add(new Node(neighbor, tentativeG, f));
                }
            }

            return List.of();
        }

        private List<BlockPos> getNeighbors(BlockPos pos) {
            List<BlockPos> neighbors = new ArrayList<>();
            int x = pos.getX(), y = pos.getY(), z = pos.getZ();

            int[][] dirs = {{1,0},{-1,0},{0,1},{0,-1}};
            for (int[] d : dirs) {
                int nx = x + d[0], nz = z + d[1];

                BlockPos ground = new BlockPos(nx, y - 1, nz);
                BlockPos feet = new BlockPos(nx, y, nz);
                BlockPos head = new BlockPos(nx, y + 1, nz);

                if (isWalkable(ground) && isStandable(feet, head)) {
                    neighbors.add(feet);
                }

                BlockPos stepUpGround = new BlockPos(nx, y, nz);
                BlockPos stepUpFeet = new BlockPos(nx, y + 1, nz);
                BlockPos stepUpHead = new BlockPos(nx, y + 2, nz);
                if (isWalkable(stepUpGround) && isStandable(stepUpFeet, stepUpHead)) {
                    neighbors.add(stepUpFeet);
                }
            }

            return neighbors;
        }

        private boolean isWalkable(BlockPos pos) {
            if (!level.isLoaded(pos)) return false;
            BlockState state = level.getBlockState(pos);
            return state.isSolid();
        }

        private boolean isStandable(BlockPos feet, BlockPos head) {
            if (!level.isLoaded(feet) || !level.isLoaded(head)) return false;
            BlockState feetState = level.getBlockState(feet);
            BlockState headState = level.getBlockState(head);
            return (feetState.isAir() || feetState.canBeReplaced()) && (headState.isAir() || headState.canBeReplaced());
        }

        private int heuristic(BlockPos pos) {
            return Math.abs(pos.getX() - goal.getX()) + Math.abs(pos.getZ() - goal.getZ());
        }

        private List<BlockPos> reconstructPath(Map<BlockPos, BlockPos> cameFrom, BlockPos current) {
            List<BlockPos> path = new ArrayList<>();
            BlockPos node = current;
            while (node != null && !node.equals(start)) {
                path.add(node);
                node = cameFrom.get(node);
            }
            Collections.reverse(path);
            return path;
        }

        record Node(BlockPos pos, int g, int f) {}
    }
}
