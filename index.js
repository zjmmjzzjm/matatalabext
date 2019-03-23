const SerialPort = require('serialport')
let delay = (time)=>{
  return new Promise((res, rej) =>{
    setTimeout(res, time);
  }); 
}


const port = new SerialPort('/dev/cu.SLAB_USBtoUART',{ baudRate: 115200 }, function (err) {
  if (err) {
    return console.log('Error: ', err.message)
  }
  console.log('open ok');

  let write = (data)=>{
    console.log('write data' + data)
    port.write(data, function(err) {
      if (err) {
        return console.log('Error on write: ', err.message)
      }
      console.log('message written')
    })
  }
  let accu = []

  let func = async ()=>{

    let state =  'NONE'; //
    //RESTART_DONGLE, 重启dongle
    //SCAN 扫描
    //SCAN_OK
    //CONNECT
    //CONNECT_OK
    //COMMAND_MOVE_FORWARD
    //COMMAND_MOVE_BACKWARd
    //COMMAND_TURN_LEFT
    //COMMAND_TURN_RIGHT

    let currentDevice = {
      mac:'',
      rssi:-100,
    }
    let MIN_RSSI_LIMIT = -70;;;;
   
    port.on('data', function (data) {
      if(state == 'SCAN_OK') {
        return;
      }
      let arr = ArrayBufferToArray(data);
      accu = accu.concat(arr);
      switch(state) {
        case  'RESTART_DONGLE': {

          let buffer = ArrayToBuffer(accu)
          let utf8str = buffer.toString('utf8')
          let retStr = 'NrfBle:Restart Ok\n-----------Start Really---------------';
          let index = utf8str.indexOf(retStr)
          if(index != -1) {
            accu = accu.slice(index+retStr.length + 1)
            console.log('accu slice', index+retStr.length + 1, accu.length)
          }
        }
          break;
        case 'SCAN': {
          let macLen = '2b1784119ee0'.length;
          let rssiLen = 3;
          let rssiIndex = 33;
          let retTemplate ='NrfBle:Matalab=2b1784119ee0 rssi=-62'; 
          let retStrHead ='NrfBle:Matalab=';
     
          let buffer = ArrayToBuffer(accu)
          let utf8str = buffer.toString('utf8')
          let index = utf8str.indexOf(retStrHead)
          while(index != -1) {
            let substr = utf8str.substr(index, retTemplate.length) 
            if(substr.length != retTemplate.length) {
               break; 
            }
            accu = accu.slice(index+retTemplate.length + 1);
            let mac  = substr.substr(retStrHead.length, macLen);
            let rssi  = parseInt(substr.substr(rssiIndex, rssiLen));

            console.log('SCAN : ' + substr, ' mac ', mac, ' rssi ', rssi)  
            if(rssi > MIN_RSSI_LIMIT) {
              state = 'SCAN_OK';
              currentDevice.mac = mac;
              currentDevice.rssi = rssi;
              accu = [] //清除所有数据
              break;
            }
            buffer = ArrayToBuffer(accu)
            utf8str = buffer.toString('utf8')
            index = utf8str.indexOf(retStrHead)
          }
        }
          break;
        case 'CONNECT':{
          let buffer = ArrayToBuffer(accu)
          let utf8str = buffer.toString('utf8')
          let retStr = 'Matata connect ok';
          let index = utf8str.indexOf(retStr);
          if(index!= -1) {
            console.log('Connect OK');
            state = 'CONNECT_OK';
            accu = accu.slice(index + retStr.length + 1);
          }
        }
          break;
        case 'COMMAND_MOVE_FORWARD':{
          let buffer = ArrayToBuffer(accu)
          let utf8str = buffer.toString('utf8')
          let retStr = 'OK';
          let index = utf8str.indexOf(retStr);
          if(index!= -1) {
            console.log('MOVE FORWARD OK');
            state = 'MOVE_FORWARD_OK';
            accu = accu.slice(index + retStr.length + 1);
          }
        }
          break;
        default:{
          console.log('UNKNOWN STATE', data.toString('utf8'))
        }
      }
    })

    //重启dongle
    let data = [0xA2,0x19,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xBB];
    write(data)
    state = 'RESTART_DONGLE'
    await delay(2000);

    //启动扫描
    data = [0xA6,0x19,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0xBF];
    write(data);
    state = 'SCAN'

    while(state == 'SCAN') {
      console.log('SCANNING...');
      await delay(1000);
    }
    console.log('Device Confirmed :', currentDevice);

    
    //0x37~0x32位mac地址，共12字节,最后的87是前面所有数字求和
    data =[0xA1,0x19,0x37,0x33,0x35,0x32,0x33,0x65,0x34,0x33,0x35,0x33,0x63,0x32,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x87];
    let writeMacStartIndex = 2;
    
    for(let i = 0 ; i < currentDevice.mac.length; i++) {
      let v = currentDevice.mac.charCodeAt(i);
      data[i + writeMacStartIndex]  = v;
    }
    calcChecSum(data); 
    //console.log(data)
    console.log('Connect..');
    state = 'CONNECT'
    write(data)

    await delay(1000);
    
    let commandFunc = (st, detailArray)=>{
      state = st
      //第三字节，数据长度，第四字节命令类型，低五位表示命令，高三位表示参数个数
      data = [0xA0,0x19,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x40];
      let reserveIndex = 2
      data[reserveIndex] = detailArray.length;
      for (let i = 0; i < detailArray.length; i ++) {
        data[i + reserveIndex + 1] = detailArray[i]
      }
      console.log('send cmd ', st);
      calcChecSum(data); 
      write(data);
    }
    let moveForward = (step) => {
      commandFunc('COMMAND_MOVE_FORWARD', [0x20, step]);
    }
    let moveBackward =(step)=> {
      commandFunc('COMMAND_MOVE_BACKWARD', [0x23, step]);
    }

    let turnLeft =(step)=> {
      commandFunc('COMMAND_TRUN_LEFT', [0x21, step]);
    }

    let turnRight=(step)=> {
      commandFunc('COMMAND_TURN_RIGHT', [0x22, step]);
    }

    let playTone = (tone,beat) => {
      //Tone 1~7
      //beat 
      commandFunc('COMMAND_PLAY_TONE', [0x70, tone, beat * 4]);
    }
    let playSound = (index) => {
      commandFunc('COMMAND_PLAY_SOUND', [0x54, index]);
    }

    let playMusic =(index) => {
      //1~6
      commandFunc('COMMOND_PLAY_MUSIC', [0x3c, index] );
    }
    let playDance =(index) => {
      //1~6
      commandFunc('COMMOND_PLAY_DANCE', [0x3a, index] );
    }

    let playAction =(index) => {
      //1~6
      commandFunc('COMMOND_PLAY_ACTION', [0x3b, index] );
    }
    //前进
    moveForward(1);

    //左转
    await delay(1000)
    turnLeft(90);

    //后退
    await delay(1000); 
    moveBackward(1);

    //右转
    await delay(1000); 
    turnRight(90);

    for (let k = 1 ; k < 8; k++) {
      await delay(2000);
      playTone(k, 2/4);
    }

    await delay(2000);
    for(let k = 1; k < 7; k++) {
      playSound(k)
      await delay(8000);
    }
    

    for(let k = 1; k < 7; k++) {
      playMusic(k);
      await delay(5000);
    }
    for(let k = 1; k < 7; k++) {
      playAction(k);
      await delay(5000);
    }
    for(let k = 1; k < 7; k++) {
      playDance(k);
      await delay(5000);
    }
    
    // 前进两部
    // 0x20,0x02
    //await delay(1000); 
    //moveForward(2);

    //await delay(1000); 
    //moveBackward(2);

    //await delay(1000); 
    //turnLeft(180);

    //await delay(1000); 
    //turnRight(180);

  }
  func();
});
//协议细节
//
//kkkk
//

function calcChecSum(dataArr) {
  let sum = 0;
  for (let i = 0; i < dataArr.length - 1; i++){
    sum = sum + dataArr[i];
  }
  sum = sum & 0xFF;
  dataArr[dataArr.length - 1] = sum;
}
function bufferToArrayBuffer(buf) {
  var ab = new ArrayBuffer(buf.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }
  return ab;
}

function ArrayBufferToBuffer(ab) {
  var buf = new Buffer(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}
function ArrayBufferToArray(ab){
  let arr = []
  let view = new Uint8Array(ab);
  for (var i = 0; i < ab.byteLength; ++i) {
    arr.push(view[i]);
  };
  return arr;
}
function ArrayToArrayBuffer(arr){
  var ab = new ArrayBuffer(arr.length);
  var view = new Uint8Array(ab);
  for (var i = 0; i < arr.length; ++i) {
    view[i] = arr[i];
  }
  return ab;
}
function ArrayToBuffer(arr){
  let ab = new Buffer(arr.length);
  for (let i = 0; i < arr.length; ++i) {
    ab[i] = arr[i];

  }
  return ab;
}
