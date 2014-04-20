// mesh: meta-event-recorder
// nestable recorder with looping

inlets = 3;
outlets = 3;

var bx = 8; //current grid view width
var by = 8; //current grid view height
var clear = 0; // clear flag
var gate = -1; // which cell is input data sent to, -1 means none, essentially a 'target' msg to poly~
var mesh = 1; // current mesh/client active
var keyMode = 1;

/*
gridState: index = x + 8*y
[0] state:
	0 = empty
	1 = armed
	2 = recording
	3 = full & stopped
	4 = full & playing
ledState: as above
[0] state:
	0 = empty
	5 = armed, full & stopped
	15 = recording, full & playing
*/
var ledState = new Array(64);
var gridState = new Array(64);
for(i=0;i<64;i++) {
	ledState[i] = 0;
	gridState[i] = 0;
}

// inside this function, add the 'which app' choice for whether it's the mesh or the client app
function gridKey() {
	var args = arrayfromargs(arguments); // grab any input and store it in 'args' array

	if(args[0]==(bx-1) && args[1]==0 && keyMode==0) {
		mesh = 1-args[2]; // if top-right & in 'switcher' mode, set mesh state with key
		if(mesh==0) frame.cancel();
		else frame.repeat();
	}
	else if(mesh == 1) { // mesh is currently active
		if(args[1]==0 && args[0]==0) { // find top-left clear button
			clear = args[2]; // set clear state to current state of 0 0
			ledState[args[0]+8*args[1]] = clear*15; // draw clear led to reflect state
		}
		else rPress(args[0]+8*args[1],args[2]); // find cell index & send state to rPress()
	}
	else if(mesh == 0) { // client app is active
		outlet(2,"/mesh/grid/key",args); // forward osc data to client
		if(gate>0) { // there is an armed recorder
			outlet(1, "target", gate);
			outlet(1, "record"); // start the recording
			outlet(1, "/mesh/grid/key",args); // send data to recorder
			gridState[gate] = 2; // set armed cell to 'recording' state
			ledState[gate] = 15; // turn on led
		}
	}
	else { // mesh == -1, hence in split grid mode or dual grid
		if(args[1]==0 && args[0]==0) { // find top-left clear button
			clear = args[2]; // set clear state to current state of 0 0
			ledState[args[0]+8*args[1]] = clear*15; // draw clear led to reflect state
		}
		else if(args[0]<bx/2) rPress(args[0]+8*args[1],args[2]); // find cell index & send state to rPress()
		else if(keyMode == 1) { // right quad, so output & shift left
			outlet(2,"/mesh/grid/key",args[0]-8,args[1],args[2]); // forward osc data to client minus offset
			if(gate>0) { // there is an armed recorder
				outlet(1,"target", gate);
				if(gridState[gate]==1) outlet(1,"record"); // start the recording if 'armed'
				outlet(1,"/mesh/grid/key",args[0]-8,args[1],args[2]); // send data to recorders
				gridState[gate] = 2; // set armed cell to 'recording' state
				ledState[gate] = 15; // turn on led
			}
		}
	}
}

function sysSize(x,y) {bx = x; by = y;}

function focus(x) {if(x==1) ledDraw();} // redraw the led display when grabbing focus

function return() { // all playback data from recorders
	var args = arrayfromargs(arguments); // grab input and dump into array (index, /osc/address, <data>)
	outlet(0,"/mesh/grid/led/level/set",args[0]%8,Math.floor(args[0]/8),5); // temporarily flash playback cell to low-bright until next frame update
	args.splice(0,1); // remove index from args
	outlet(2,args); // forward to client app for playback
}

function end(locate) { // if playback has reached the end
	gridState[locate] = 3;
	ledState[locate] = 5;
}

function swMode(state) { // 0=switch, 1=split
	// change input to output routing & shift presses
	keyMode = state;
	if(keyMode!=0) mesh = -1;
}

function gridLed() { // monome led commands from client app 
	var args = arrayfromargs(arguments); // grab all in the input
	if(keyMode == 0 && mesh == 0) outlet(0, args); // if in switch mode, send through leds if in client mode
	else if(keyMode == 1) { // in split mode so shift led draw commands
		if(args[0] == "/mesh/grid/led/all" || args[0] == "/mesh/grid/led/level/all") outlet(0, "/mesh/grid/led/map",8,0,0,0,0,0,0,0,0,0);
		else { // all other messages allow x offset
			args[1] = args[1]+8; // add 8 to the x-offset
			outlet(0, args);
		}
	}
}

function anything() { // this method catches any input that doesn't match above
	// use to capture & transmit general OSC messages that don't have to come from grid
	var args = arrayfromargs(messagename, arguments);
	post(args + "\n");
	if(inlet==0) {} // data to recorders
	else if(inlet==2) {} // data from client app -> forward back to client
}

function rPress(locate,state) { // process the main key data
	if(clear == 0) { // press to recorders
		switch(gridState[locate]) { // check the current status of the pressed cell
			case 0: // currently empty: press arms for recording
			if(state==1) { 
				setGate(locate); // set the gate to the new press, deactivate previously gated cell
				gridState[locate] = 1; // set to armed
				ledState[locate] = 5; // dim lighting
			}
			break;

			case 1: // armed: press disables recording if nothing yet received
			if(state==1) {
				gate = -1; // as this was an active press to deactivate a cell, all other recorders must be off
				gridState[locate] = 0; // return to empty
				ledState[locate] = 0; // turn cell off
			}
			break;

			case 2: // recording: any press causes the end of the recording
			if(state==1) {
				setGate(-1);
				//outlet(1,"target", locate);
				//outlet(1, "end"); // send 'end' to relevant cell
				gridState[locate] = 3; // change to full&stopped mode
				ledState[locate] = 5; // dim level to indicate recorder full
			}
			break;
			
			case 3: // full-stopped: any press starts playback
			if(state==1) {
				outlet(1,"target", locate);
				outlet(1, "start");
				gridState[locate] = 4; // now full&playback
				ledState[locate] = 15; // full bright
			}
			break;

			case 4: // full-playback: any press retriggers start of playback (could add overdub here?)
			if(state==1) { // just restart as grid&led state remain the same
				outlet(1, "target", locate);
				outlet(1, "start"); // restart playback
			}
			break;
		}
	}
	else if(state==1) { // press while clear is held
		outlet(1,"target", locate);
		outlet(1, "clear");
		setGate(-1);
		gridState[locate] = 0;
		ledState[locate] = 0;
	}
}

function setGate(locate) {
	// a new cell has been set to record, so disarm any previously armed cell
	if(gate>0) { // another cell is currently armed
		if(gridState[gate]==1) { // if just armed, simply return to empty state
			gridState[gate] = 0;
			ledState[gate] = 0;
		}
		else { // another cell is currently recording, so end that recording before arming new cell
			outlet(1,"target", gate);
			outlet(1,"end"); // send 'end' to currently recording cell
			gridState[gate] = 3; // set to full & stopped
			ledState[gate] = 5; // set to dim light
		}
	}
	gate = locate; // then update gate to the newly armed cell
}

var frame = new Task(ledDraw, this);
frame.interval = 50; // 20fps redraw
frame.repeat();

function ledDraw() { // draw the full led array to the grid -> called as a repeating task
	outlet(0,"/mesh/grid/led/level/map",0,0,ledState);
}
