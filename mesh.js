// mesh: meta-event-recorder
// nestable recorder with looping

inlets = 2;
outlets = 3;

var bx = 8; //current grid view width
var by = 8; //current grid view height
var clear = 0; // clear flag
var gate = -1; // which cell is input data sent to, -1 means none, essentially a 'target' msg to poly~
var mesh = 1; // current mesh/client active

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
function gridKey(x,y,s) {
	if(mesh == 1) { // mesh is currently active
		if(y==0 && x==0) {
			clear = s; // clear button
			ledState[x+8*y] = clear*15;
		}
		else rPress(x+8*y,s); // normal presses to pattern recorders
	}
	else { // client app is active
		outlet(2,"/client/grid/key",x,y,s); // forward osc data to client
		if(gate>0) { // there is an armed recorder
			outlet(1,"target", gate, "start"); // start the recording
			outlet(1,"target", gate, "/client/grid/key",x,y,s); // send data to recorder
			gridState[gate] = 2; // set armed cell to 'recording' state
			ledState[gate] = 15; // turn on led
		}
	}
}

function sysSize(x,y) {bx = x; by = y;}

function focus(x) {if(x==1) ledDraw();} // redraw the led display when grabbing focus

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
				outlet(1,"target", locate, "end"); // send 'end' to relevant cell
				gridState[locate] = 3; // change to full&stopped mode
				ledState[locate] = 5; // dim level to indicate recorder full
			}
			break;
			
			case 3: // full-stopped: any press starts playback
			if(state==1) {
				outlet(1,"target", locate, "start");
				gridState[locate] = 4; // now full&playback
				ledState[locate] = 15; // full bright
			}
			break;

			case 4: // full-playback: any press retriggers start of playback (could add overdub here?)
			if(state==1) { // just restart as grid&led state remain the same
				outlet(1, "target", locate, "start"); // restart playback
			}
			break;
		}
	}
	else if(state==1) { // press while clear is held
		outlet(1,"target", locate, "clear");
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
			// formally call end process -> see case 3 above
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

function return(ix,a,x,y,s) { // all playback data from recorders
	outlet(2,a,x,y,s); // remove ix and forward to client app for playback
	outlet(0,"/mesh/grid/led/level/set",ix%8,Math.floor(ix/8),5); // temporarily flash playback cell to low-bright until next frame update
}

function end(locate) { // if playback has reached the end
	gridState[locate] = 3;
	ledState[locate] = 5;
}