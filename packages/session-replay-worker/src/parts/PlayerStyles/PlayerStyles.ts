export const playerStyles = `
.SessionReplay > .SessionReplayControls {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  flex: none;
  align-items: center;
  gap: 0 18px;
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
  grid-column: 1;
  grid-row: 2;
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
  grid-column: 2;
  grid-row: 2;
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
.SessionReplayControls > .SessionReplayActivity {
  grid-column: 2;
  grid-row: 1;
  display: block;
  width: calc(100% - 13px);
  min-width: 0;
  height: 48px;
  margin: 0 6.5px;
  border-bottom: 1px solid #454950;
  fill: #00adef80;
  cursor: pointer;
}
.SessionReplayControls > .SessionReplayActivity:hover {
  fill: #00adefb3;
}
.SessionReplayActivityCursor {
  stroke: #ffffff;
  stroke-width: 1;
  pointer-events: none;
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
  grid-column: 3;
  grid-row: 2;
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
.SessionReplayControls > .SessionReplayPreviewSetting {
  grid-column: 2 / -1;
  grid-row: 3;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  font: inherit;
  cursor: pointer;
}
.SessionReplayPreviewSetting > input {
  accent-color: #00adef;
}
.SessionReplay > .SessionReplayPreview {
  position: fixed;
  z-index: 1;
  padding: 4px;
  border: 1px solid #ffffff40;
  border-radius: 6px;
  background: #181a1f;
  color: #f4f4f5;
  box-shadow: 0 4px 20px #00000080;
  pointer-events: none;
  font: 12px/1.4 system-ui, sans-serif;
}
.SessionReplayPreview[hidden] {
  display: none;
}
.SessionReplayPreviewImage {
  overflow: hidden;
  position: relative;
  background: white;
}
.SessionReplayPreviewImage > iframe {
  display: block;
  position: absolute;
  inset: 0;
  border: 0;
  margin: 0;
  padding: 0;
  transform-origin: top left;
  pointer-events: none;
}
.SessionReplayPreviewTime {
  padding-top: 4px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 480px) {
  .SessionReplay > .SessionReplayControls {
    column-gap: 12px;
    margin: 8px;
    padding: 8px;
    font-size: 12px;
  }
  .SessionReplayControls > .SessionReplayPlay {
    width: 44px;
  }
}
@media (forced-colors: active) {
  .SessionReplayControls > .SessionReplayActivity {
    fill: Highlight;
    border-color: CanvasText;
  }
  .SessionReplayActivityCursor {
    stroke: CanvasText;
  }
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
