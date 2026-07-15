package com.aerokitten.bot.mixin;

import com.aerokitten.bot.AeroKittenBotMod;
import net.minecraft.client.GuiMessageTag;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MessageSignature;
import org.jetbrains.annotations.Nullable;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ChatComponent.class)
public class ChatMixin {

    @Inject(method = "addMessage(Lnet/minecraft/network/chat/Component;)V", at = @At("HEAD"), remap = false)
    private void onAddMessage(Component component, CallbackInfo ci) {
        AeroKittenBotMod instance = AeroKittenBotMod.getInstance();
        if (instance != null && instance.getBotClient() != null) {
            String text = component.getString();
            instance.getBotClient().log("[CHAT] " + text);
            instance.getBotClient().sendEvent("chat_message", "text", text);
        }
    }

    @Inject(method = "addMessage(Lnet/minecraft/network/chat/Component;Lnet/minecraft/network/chat/MessageSignature;Lnet/minecraft/client/GuiMessageTag;)V", at = @At("HEAD"), remap = false)
    private void onAddMessageFull(Component component, @Nullable MessageSignature signature, @Nullable GuiMessageTag tag, CallbackInfo ci) {
        AeroKittenBotMod instance = AeroKittenBotMod.getInstance();
        if (instance != null && instance.getBotClient() != null) {
            String text = component.getString();
            instance.getBotClient().log("[CHAT] " + text);
            instance.getBotClient().sendEvent("chat_message", "text", text);
        }
    }
}
