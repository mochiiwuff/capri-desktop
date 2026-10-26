# Watches the top-level windows so Capri can sit on them on macOS.
# Emits one JSON line via log whenever something changes:
# {"fg": "Google Chrome::1", "wins": [{"id":"Google Chrome::1","x":23,"y":40,"w":1438,"h":844,"max":false},...]}
#
#   osascript windows.applescript <capri pid>

on run argv
  set parentPid to 0
  if (count of argv) > 0 then
    try
      set parentPid to (item 1 of argv) as integer
    end try
  end if

  set lastSnap to ""
  set tick to 0

  repeat
    set snap to getSnapshot()
    if snap is not equal to lastSnap and snap is not "" then
      log snap
      set lastSnap to snap
    end if

    set tick to tick + 1
    -- Check if parent process is still alive every ~15 ticks (~6 seconds)
    if parentPid > 0 and (tick mod 15) is 0 then
      try
        do shell script "kill -0 " & parentPid
      on error
        exit repeat
      end try
    end if

    delay 0.4
  end repeat
end run

on getSnapshot()
  try
    tell application "System Events"
      set fgProc to first application process whose frontmost is true
      set fgName to name of fgProc
      set allWins to {}
      set fgId to ""

      set otherProcs to (application processes whose background only is false and frontmost is false)
      set procs to {fgProc} & otherProcs

      set countWins to 0
      repeat with p in procs
        try
          set pName to name of p
          if pName is not "Capri" and pName is not "Electron" then
            set pWins to windows of p
            repeat with i from 1 to count of pWins
              try
                set w to item i of pWins
                set isMin to false
                try
                  set isMin to (value of attribute "AXMinimized" of w)
                end try
                if not isMin then
                  set {wx, wy} to position of w
                  set {ww, wh} to size of w
                  -- Minimum window dimensions to sit on (same as Windows)
                  if ww ≥ 200 and wh ≥ 120 then
                    set isMax to false
                    try
                      set isMax to (value of attribute "AXFullScreen" of w)
                    end try
                    set wId to pName & "::" & i
                    if fgId is "" and pName is fgName then
                      set fgId to wId
                    end if
                    set maxStr to "false"
                    if isMax then
                      set maxStr to "true"
                    end if
                    set winJson to "{\"id\":\"" & wId & "\",\"x\":" & (wx as integer) & ",\"y\":" & (wy as integer) & ",\"w\":" & (ww as integer) & ",\"h\":" & (wh as integer) & ",\"max\":" & maxStr & "}"
                    set end of allWins to winJson
                    set countWins to countWins + 1
                    if countWins ≥ 35 then exit repeat
                  end if
                end if
              end try
            end repeat
          end if
        end try
        if countWins ≥ 35 then exit repeat
      end repeat

      set AppleScript's text item delimiters to ","
      set winsJson to allWins as string
      set AppleScript's text item delimiters to ""

      return "{\"fg\":\"" & fgId & "\",\"wins\":[" & winsJson & "]}"
    end tell
  on error
    return ""
  end try
end getSnapshot
