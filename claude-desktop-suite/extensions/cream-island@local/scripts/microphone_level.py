#!/usr/bin/env python3
"""Default-input peak meter. Never stores/transmits audio; stdout is numeric only."""
import argparse
import math
import signal
import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib

def normalized_peak(db):
    return max(0.0, min(1.0, 10 ** (float(db) / 20))) if math.isfinite(float(db)) else 0.0

def pipeline_description(test_volume=None):
    source = ('pulsesrc name=mic' if test_volume is None
              else 'audiotestsrc is-live=true volume=%s' % float(test_volume))
    return source + ' ! audio/x-raw,rate=8000,channels=1 ! level interval=100000000 post-messages=true ! fakesink sync=false'

def create_pipeline(test_volume=None):
    pipeline=Gst.parse_launch(pipeline_description(test_volume))
    if test_volume is None:
        properties=Gst.Structure.new_empty('props')
        properties.set_value('application.id','cream-island-level@local')
        pipeline.get_by_name('mic').set_property('stream-properties',properties)
    return pipeline

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--test-volume',type=float); parser.add_argument('--samples',type=int,default=0)
    args=parser.parse_args(); Gst.init(None); loop=GLib.MainLoop(); pipeline=create_pipeline(args.test_volume); count=0
    def message(bus,msg):
        nonlocal count
        if msg.type==Gst.MessageType.ELEMENT:
            st=msg.get_structure()
            if st and st.get_name()=='level':
                print('%.5f' % normalized_peak(max(st.get_value('peak'))),flush=True);count+=1
                if args.samples and count>=args.samples: loop.quit()
        elif msg.type in (Gst.MessageType.ERROR,Gst.MessageType.EOS): loop.quit()
    bus=pipeline.get_bus();bus.add_signal_watch();bus.connect('message',message)
    signal.signal(signal.SIGTERM,lambda *_:loop.quit()); pipeline.set_state(Gst.State.PLAYING)
    try:loop.run()
    finally:pipeline.set_state(Gst.State.NULL);bus.remove_signal_watch()
if __name__=='__main__':main()
