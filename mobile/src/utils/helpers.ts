/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Generate a unique Group ID in format GRP-XXXX-XXXX-XXXX
 */
export function generateGroupId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const part = () => {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };
  return `GRP-${part()}-${part()}-${part()}`;
}

/**
 * Format timestamp to readable time
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 24 hours - show time
  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Less than 7 days - show day name
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  // Otherwise show date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format Whisper ID for display (add spaces)
 */
export function formatWhisperId(id: string): string {
  return id; // Already formatted as WSP-XXXX-XXXX-XXXX
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get initials from username or Whisper ID
 */
export function getInitials(name: string): string {
  if (name.startsWith('WSP-')) {
    return name.substring(4, 6);
  }
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Validate Whisper ID format
 */
export function isValidWhisperId(id: string): boolean {
  const regex = /^WSP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return regex.test(id);
}

/**
 * Parse QR code data
 */
export function parseQRData(data: string): { whisperId: string; publicKey: string } | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.whisperId && parsed.publicKey) {
      return {
        whisperId: parsed.whisperId,
        publicKey: parsed.publicKey,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create QR code data
 */
export function createQRData(whisperId: string, publicKey: string): string {
  return JSON.stringify({ whisperId, publicKey });
}
