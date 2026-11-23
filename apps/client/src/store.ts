import { create } from "zustand";

interface LocalState {
  position: { x: number; y: number; z: number };
  running: boolean;
  setPosition: (p: { x: number; y: number; z: number }, running: boolean) => void;
}

export const useLocalStore = create<LocalState>((set) => ({
  position: { x: 0, y: 0, z: 0 },
  running: false,
  setPosition: (position, running) => set({ position, running }),
}));
