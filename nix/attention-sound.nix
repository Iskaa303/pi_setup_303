# A short two-tone chime for attention-notify, synthesised here so no sound file
# has to be vendored or downloaded: two decaying sine blips, 320ms, mono 44.1kHz.
# Public domain by construction — it is generated, not copied.
{ pkgs }:
pkgs.runCommand "attention-chime.wav" { nativeBuildInputs = [ pkgs.ffmpeg ]; } ''
  ffmpeg -hide_banner -loglevel error -f lavfi -i \
    "sine=frequency=880:duration=0.12,volume=0.35[a];
     sine=frequency=1320:duration=0.20,volume=0.30,adelay=110|110[b];
     [a][b]amix=inputs=2:duration=shortest,afade=t=out:st=0.2:d=0.2,
     aformat=channel_layouts=mono" \
    -ar 44100 -ac 1 -y $out
''
