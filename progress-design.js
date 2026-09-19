/* Plain text only. Escape when interpolating the result into HTML. */
window.LoyaltyProgress = {
  normalize(design = {}) {
    const symbol = (value, fallback) =>
      typeof value === "string" && value.trim() && value.length <= 16 ? value.trim() : fallback;
    return {
      progress_emoji: symbol(design?.progress_emoji, "★"),
      empty_emoji: symbol(design?.empty_emoji, "☆")
    };
  },
  render(completed, total = 10, design = {}) {
    const count = Math.min(100, Math.max(0, Math.floor(Number(total) || 0)));
    const done = Math.min(count, Math.max(0, Math.floor(Number(completed) || 0)));
    const symbols = this.normalize(design);
    return symbols.progress_emoji.repeat(done) + symbols.empty_emoji.repeat(count - done);
  },
  async forToken(db, token) {
    try {
      const { data, error } = await db.rpc("get_loyalty_card_design", { card_token: token });
      if (error) return this.normalize();
      return this.normalize(data?.[0]);
    } catch { return this.normalize(); }
  }
};
