export const playerStyles = `
.SessionReplay > .SessionReplayControls {
  box-sizing: border-box;
  display: flex;
  flex: none;
  align-items: center;
  gap: 18px;
  margin: 12px 16px 16px;
  padding: 10px 16px 10px 10px;
  border: 1px solid #ffffff1f;
  border-radius: 12px;
  background: #181a1f;
  color: #f4f4f5;
  box-shadow: 0 4px 20px #00000040;
  font: 13px/1.4 system-ui, sans-serif;
  color-scheme: dark;
}
.SessionReplayControls > .SessionReplayPlay {
  appearance: none;
  display: grid;
  place-items: center;
  flex: none;
  width: 52px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #00adef;
  color: #07141c;
  cursor: pointer;
}
.SessionReplayControls > .SessionReplayPlay:hover:not(:disabled) {
  background: #43caff;
}
.SessionReplayControls > .SessionReplayPlay:active:not(:disabled) {
  background: #0095ce;
}
.SessionReplayPlay > svg {
  display: block;
  width: 22px;
  height: 22px;
  fill: currentColor;
  pointer-events: none;
}
.SessionReplayControls > .SessionReplayPosition {
  appearance: none;
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  --replay-progress: 0%;
}
.SessionReplayPosition::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 3px;
  background: linear-gradient(to right, #00adef var(--replay-progress), #454950 var(--replay-progress));
}
.SessionReplayPosition::-moz-range-track {
  height: 5px;
  border-radius: 3px;
  background: #454950;
}
.SessionReplayPosition::-moz-range-progress {
  height: 5px;
  border-radius: 3px;
  background: #00adef;
}
.SessionReplayPosition::-webkit-slider-thumb {
  appearance: none;
  width: 13px;
  height: 13px;
  margin-top: -4px;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 5px #00000066;
}
.SessionReplayPosition::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 5px #00000066;
}
.SessionReplayControls > :focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 4px;
}
.SessionReplayControls > :disabled {
  opacity: 0.45;
  cursor: default;
}
.SessionReplayControls > .SessionReplayTime {
  flex: none;
  font: inherit;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.SessionReplayControls > .SessionReplayTime[role='alert'] {
  flex: 1;
  min-width: 0;
  color: #ffb4ab;
  white-space: normal;
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .SessionReplay > .SessionReplayControls {
    gap: 12px;
    margin: 8px;
    padding: 8px;
    font-size: 12px;
  }
  .SessionReplayControls > .SessionReplayPlay {
    width: 44px;
  }
}
@media (forced-colors: active) {
  .SessionReplayControls > .SessionReplayPlay {
    border: 1px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
  .SessionReplayControls > .SessionReplayPosition {
    appearance: auto;
  }
}
`
