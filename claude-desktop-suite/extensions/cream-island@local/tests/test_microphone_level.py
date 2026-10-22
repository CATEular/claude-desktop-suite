"""Exercises the shipped pipeline only with synthetic sound, never a mic."""
import pathlib,subprocess,sys
helper=pathlib.Path(__file__).resolve().parents[1]/'scripts'/'microphone_level.py'
import importlib.util
spec=importlib.util.spec_from_file_location('level_helper',helper);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.Gst.init(None)
pipeline=module.create_pipeline()
assert pipeline.get_by_name('mic').get_property('stream-properties').get_value('application.id')=='cream-island-level@local'
pipeline.set_state(module.Gst.State.NULL)
for amplitude in [0,0.2,0.5]:
    output=subprocess.check_output([sys.executable,str(helper),'--test-volume',str(amplitude),'--samples','3'],timeout=6,text=True)
    values=[float(x) for x in output.splitlines()]
    assert len(values)==3 and all(0<=x<=1 for x in values)
    assert all(abs(x-amplitude)<0.005 for x in values),(amplitude,values)
print('Production GStreamer helper: silence and 0.2/0.5 synthetic peaks passed; no microphone opened.')
