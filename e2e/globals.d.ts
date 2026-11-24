// Debug hook the client installs (apps/client/src/net/connection.ts).
declare global {
  interface Window {
    __neonBay?: {
      sessionId: () => string | null;
      players: () => { id: string; name: string; x: number; z: number; local: boolean }[];
    };
  }
}
export {};
