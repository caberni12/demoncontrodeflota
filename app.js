/* =====================================
   FLEETPRO PRO
   SISTEMA JAVASCRIPT
===================================== */



/* =====================================
   NAVEGACION MENU
===================================== */


const menuButtons =
document.querySelectorAll(".nav-item");


const pages =
document.querySelectorAll(".page");




menuButtons.forEach(button=>{


button.addEventListener("click",()=>{


const page =
button.dataset.page;



// quitar activo menú

menuButtons.forEach(btn=>{

btn.classList.remove("active");

});




// activar seleccionado

button.classList.add("active");




// ocultar páginas

pages.forEach(page=>{

page.classList.remove("active");

});




// mostrar página

const selected =
document.getElementById(page);


if(selected){

selected.classList.add("active");

}



});

});








/* =====================================
   NOTIFICACIONES
===================================== */


const notificationBtn =
document.getElementById(
"notificationBtn"
);



const notificationPanel =
document.getElementById(
"notificationPanel"
);



const closeNotify =
document.getElementById(
"closeNotify"
);





notificationBtn.onclick=()=>{


notificationPanel.style.display="block";


};





closeNotify.onclick=()=>{


notificationPanel.style.display="none";


};









/* =====================================
   SCANNER QR REAL
===================================== */


let scanner;





function iniciarScanner(){


const reader =
document.getElementById(
"reader"
);



if(!reader) return;





scanner =
new Html5QrcodeScanner(

"reader",

{

fps:10,

qrbox:250


}

);






scanner.render(

(qrCode)=>{


console.log(
"QR Detectado:",
qrCode
);




mostrarVehiculo();



},

(error)=>{


// errores normales de lectura


}



);



}








function mostrarVehiculo(){



const info =
document.getElementById(
"vehicleInfo"
);



if(info){


info.classList.remove(
"hidden"
);



}



}







// iniciar cuando entra al módulo QR

const qrButton =
document.querySelector(
'[data-page="qr"]'
);





if(qrButton){


qrButton.addEventListener(
"click",

()=>{


setTimeout(()=>{

iniciarScanner();

},500);


}

);


}









/* =====================================
   INICIO CONDUCCION
===================================== */


const startTrip =
document.getElementById(
"startTrip"
);




if(startTrip){


startTrip.onclick=()=>{


alert(

"🚛 Conducción iniciada correctamente"

);




startTrip.innerHTML =
"🟢 VIAJE ACTIVO";



startTrip.disabled=true;



console.log({

vehiculo:
"ABCD12",

conductor:
"Carlos Ramírez",

hora:
new Date()

});



};



}









/* =====================================
   GRAFICO REPORTES
===================================== */


const chart =
document.getElementById(
"fleetChart"
);



if(chart){



new Chart(

chart,

{


type:"line",



data:{


labels:[

"Enero",
"Febrero",
"Marzo",
"Abril",
"Mayo",
"Junio"

],



datasets:[{


label:

"Kilómetros recorridos",



data:[

3000,
4200,
5500,
6100,
7200,
8500

],



borderWidth:3



}]



},




options:{


responsive:true,


plugins:{


legend:{


display:true


}


}



}


}



);



}









/* =====================================
   SIMULACION GPS
===================================== */


let gpsSpeed=70;




setInterval(()=>{


gpsSpeed +=

Math.floor(
Math.random()*6
);



if(gpsSpeed>95){

gpsSpeed=70;

}



console.log(

"GPS vehículo ABCD12:",
gpsSpeed,
"km/h"

);



},5000);









/* =====================================
   SISTEMA INICIADO
===================================== */


window.onload=()=>{


console.log(

"FleetPro Pro iniciado"

);



};