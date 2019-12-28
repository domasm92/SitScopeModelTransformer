
'use strict';

import { has } from "min-dash";

export default class ModelTransformer{
constructor(bpmnjs,modeling,config,eventBus, bpmnRenderer, textRenderer,cli,bpmnFactory,bpmnReplace,elementRegistry) {
    var self=this;
    this.cli=cli;
      this.bpmnjs=bpmnjs;
      this.modeling=modeling;
      this.defaultFillColor = config && config.defaultFillColor;
      this.defaultStrokeColor = config && config.defaultStrokeColor;
      this.bpmnRenderer = bpmnRenderer;
      this.textRenderer=textRenderer;
      this.bpmnFactory=bpmnFactory;
      this.bpmnReplace=bpmnReplace;
      this.elementRegistry=elementRegistry;
      this.participantshapeposition=1;
      this.lastparticipantshape;
      this.taskpositioncounter=0;
      this.endeventmapping={};
      this.evaluationsubprocesssituationmapping={};

      //console.log(this.cli.help());
    }
      transformModel(result){
        console.log(result);
        
        var collabo = this.cli.element('StartEvent_1');
        var diagramDefinitions= result["bpmn2:definitions"];
        var choreo=diagramDefinitions["bpmn2:choreography"];
        var messages=diagramDefinitions["bpmn2:message"];
        var sequenceFlows=choreo[0]["bpmn2:sequenceFlow"];
        var participants=choreo[0]["bpmn2:participant"];
        var messageFlows=choreo[0]["bpmn2:messageFlow"];
        var subProcesses=choreo[0]["bpmn2:subProcess"];
        var startEvent=choreo[0]["bpmn2:startEvent"][0];
        var endEvents=choreo[0]["bpmn2:endEvent"];
        console.log(collabo);

        var diagramDefinitions=collabo.businessObject.$parent.$parent;
        var rootElements = diagramDefinitions.rootElements || [];

        var startingSituationalScope=this.findStartingSituationalScope(startEvent, sequenceFlows, subProcesses);
        var evaluationprocess=startingSituationalScope['bpmn2:subProcess'][0];
        //console.log(evaluationprocess);
        var isfirstelementChoreography=this.checknextelement(evaluationprocess);
        var startingChoreographyTask;
        if(isfirstelementChoreography[0]===false){
          startingChoreographyTask=this.getValidFirstChoreographyTask(evaluationprocess);
        }else{
          startingChoreographyTask=this.findStartingChoreographyTask(evaluationprocess);
        }
        //console.log(firstelementChoreography);
        //TODO if firstelementChoreography false, 
         
        //console.log(startingChoreographyTask);
        //initiating participant of the initiating situation choreography
        var participantref= startingChoreographyTask.$.initiatingParticipantRef;
        var fittingParticipantName;
        fittingParticipantName = this.getParticipant(participants, participantref);
        //create the first participant which includes the regular path and error paths
        var participant= this.cli.append(collabo.id, 'bpmn:Participant');   
        var participantshape = this.cli.element(participant);
        this.modeling.updateProperties(participantshape,{id:participantref});    

        this.cli.setLabel(participantshape,fittingParticipantName);
        this.lastparticipantshape=participantshape;

        //console.log(participantshape);
        //start of evaluation of situation and standard situation execution subprocess
        var isContinuePath=true;
        this.createEvaluationProcess(isContinuePath, collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName);
        console.log(this.endeventmapping);
        console.log(this.evaluationsubprocesssituationmapping);
       }
    

  createEvaluationProcess(isContinuePath,collabo, startingChoreographyTask, participantref, participants, participantshape, rootElements, startingSituationalScope, sequenceFlows, subProcesses, fittingParticipantName) {
    
    var evaluationprocess=startingSituationalScope['bpmn2:subProcess'][0];

    console.log(startingSituationalScope);
    var evaluationSubprocess = this.cli.append(collabo.id, 'bpmn:SubProcess', '300,300');
    this.bpmnReplace.replaceElement(this.cli.element(evaluationSubprocess), {
      type: "bpmn:SubProcess",
      isExpanded: true
    });
    var evaluationSubprocessShape = this.cli.element(evaluationSubprocess);
    //console.log(this.cli.element(evaluationSubprocessShape));
    var subprocessStartEvent = this.cli.create('bpmn:StartEvent', {
      x: evaluationSubprocessShape.x,
      y: evaluationSubprocessShape.y
    }, evaluationSubprocessShape);
    var evaluateavailability=this.cli.append(subprocessStartEvent,'bpmn:Task');
    this.cli.setLabel(evaluateavailability,"Evaluate situation");
    //create participants which have to be evaluated for their situation
    var setglobalendevent=false;
      this.executeChoreographyTaskTreeWalker(evaluationprocess,participants,rootElements,participantref,evaluateavailability,evaluationSubprocess,setglobalendevent);
      this.evaluationsubprocesssituationmapping[startingSituationalScope['$']['id']]=evaluationSubprocessShape;
      console.log(startingSituationalScope);
      var lastelement= this.getLastElementOfParticipantBeforeEndEvent(evaluationSubprocess);
      var evaluationgateway=this.cli.append(lastelement,'bpmn:ExclusiveGateway');
      var endeval=this.cli.append(evaluationgateway,'bpmn:EndEvent');
      var continuepath;
      if(startingSituationalScope['$']['sitscope:waitforentry']==="true"){
        this.cli.connect(evaluationgateway, evaluateavailability, 'bpmn:SequenceFlow', '150,0');        
        
      //adaption path
      var boundary = this.cli.create('bpmn:BoundaryEvent', {
        x: evaluationSubprocessShape.x+evaluationSubprocessShape.width,
        y: evaluationSubprocessShape.y + 70
      }, evaluationSubprocessShape, true);
      var boundaryShape = this.cli.element(boundary);
      this.bpmnReplace.replaceElement(boundaryShape, {
        type: "bpmn:BoundaryEvent",
        eventDefinitionType: "bpmn:TimerEventDefinition"
      });
      console.log(evaluationSubprocessShape);
      setglobalendevent=true;
      this.executeChoreographyTaskTreeWalker(startingSituationalScope,participants,rootElements,participantref,evaluationSubprocess,undefined,setglobalendevent);

        if(startingSituationalScope['$']['sitscope:entryCondition']==="Adapt"){
          var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
          continuepath=adaptiondecision;
          //find adaption situations
          console.log(continuepath);
          this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision);

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Return"){
          var previousfittingsituation=this.getvalidpreviousSituation(startingSituationalScope,sequenceFlows,subProcesses);
          console.log(previousfittingsituation);
          var situationevaluation=this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
          console.log(situationevaluation);
          var messageStartEvent = this.cli.create('bpmn:StartEvent', {
            x: situationevaluation.x-50,
            y: situationevaluation.y-50
          }, situationevaluation.parent);
          var messageStartEventShape=this.cli.element(messageStartEvent);
          this.bpmnReplace.replaceElement(messageStartEventShape, {
            type: "bpmn:StartEvent",
            eventDefinitionType: "bpmn:MessageEventDefinition"
          });
          this.cli.connect(messageStartEvent,situationevaluation,'bpmn:SequenceFlow');
          var messageend=this.cli.append(boundary,'bpmn:EndEvent');
          var messageendShape=this.cli.element(messageend);
          this.bpmnReplace.replaceElement(messageendShape, {
            type: "bpmn:EndEvent",
            eventDefinitionType: "bpmn:MessageEventDefinition"
          });
          this.cli.connect(messageend,messageStartEvent,'bpmn:MessageFlow');
        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Continue"){

          var firstel=evaluationSubprocessShape.outgoing[0].businessObject.targetRef.id;
          this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');       
          this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision);

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Retry"){
          this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');        

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Abort"){
          var endabort=this.cli.append(boundary,'bpmn:EndEvent');

        }

      }else if(startingSituationalScope['$']['sitscope:waitforentry']==="false"){
        var signalendevent=this.cli.append(evaluationgateway,'bpmn:EndEvent','0,150');
        var signalendeventshape=this.cli.element(signalendevent);
        this.bpmnReplace.replaceElement(signalendeventshape, {
          type: "bpmn:EndEvent",
          eventDefinitionType: "bpmn:SignalEventDefinition"
        });


        //adaption path
      var boundary = this.cli.create('bpmn:BoundaryEvent', {
        x: evaluationSubprocessShape.x+evaluationSubprocessShape.width,
        y: evaluationSubprocessShape.y + 70
      }, evaluationSubprocessShape, true);
      var boundaryShape = this.cli.element(boundary);
      this.bpmnReplace.replaceElement(boundaryShape, {
        type: "bpmn:BoundaryEvent",
        eventDefinitionType: "bpmn:SignalEventDefinition"
      });
        if(startingSituationalScope['$']['sitscope:entryCondition']==="Adapt"){
          var adaptiondecision = this.cli.append(boundary, 'bpmn:ExclusiveGateway', '150,0');
          continuepath=adaptiondecision;
          this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision);

          //find adaption situations
          console.log(continuepath);        
        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Return"){
          var previousfittingsituation=this.getvalidpreviousSituation(startingSituationalScope,sequenceFlows,subProcesses);
          console.log(previousfittingsituation);
          var situationevaluation=this.evaluationsubprocesssituationmapping[previousfittingsituation['$']['id']];
          console.log(situationevaluation);
          var messageStartEvent = this.cli.create('bpmn:StartEvent', {
            x: situationevaluation.x-50,
            y: situationevaluation.y-50
          }, situationevaluation.parent);
          var messageStartEventShape=this.cli.element(messageStartEvent);
          this.bpmnReplace.replaceElement(messageStartEventShape, {
            type: "bpmn:StartEvent",
            eventDefinitionType: "bpmn:MessageEventDefinition"
          });
          this.cli.connect(messageStartEvent,situationevaluation,'bpmn:SequenceFlow');
          var messageend=this.cli.append(boundary,'bpmn:EndEvent');
          var messageendShape=this.cli.element(messageend);
          this.bpmnReplace.replaceElement(messageendShape, {
            type: "bpmn:EndEvent",
            eventDefinitionType: "bpmn:MessageEventDefinition"
          });
          this.cli.connect(messageend,messageStartEvent,'bpmn:MessageFlow');

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Continue"){
          var firstel=evaluationSubprocessShape.outgoing[0].businessObject.targetRef;
          this.cli.connect(boundary, firstel, 'bpmn:SequenceFlow', '150,0');        
          this.findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, participantref, participantshape, rootElements, adaptiondecision);

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Retry"){
          this.cli.connect(boundary, evaluationSubprocess, 'bpmn:SequenceFlow', '150,0');        

        }else if(startingSituationalScope['$']['sitscope:entryCondition']==="Abort"){
          var endabort=this.cli.append(boundary,'bpmn:EndEvent');

        }
      }else{
        var finalend=this.cli.append(evaluationSubprocess,'bpmn:EndEvent');
        this.endeventmapping[participantref]=finalend;
      }

     


    
    

    
  }

  executeChoreographyTaskTreeWalker(startingSituationalScope,participants,rootElements,initiatingparticipant,startingpoint,evaluationSubprocess,setglobalendevent){
    console.log(setglobalendevent);
    var participanthelpingstructure = this.getNumberOfParticipantsOfChorProcess(startingSituationalScope);
    var visitedparticipants=participanthelpingstructure[0];
    var visitedparticipantsarraylist=participanthelpingstructure[1];
    //console.log(visitedparticipants);
    //console.log(Object.keys(visitedparticipants));
    var currentelement;
    var participantkeys=Object.keys(visitedparticipants);
    var globalchortaskmapping=participanthelpingstructure[2];
    //console.log(participantkeys);
    for(var i=0;i<participantkeys.length;i++){
      var positioningmapping={};

      var addposition=false;
      var positioncounter=0;
      var startingelement;
      var endingelement;
      var elementmappinglist={};
      var stack = [];
      var visited = [];
      var output = [];
      var maxref=visitedparticipants[participantkeys[i]];
      var currentref=0;
      var elementsofparticipant=visitedparticipantsarraylist[participantkeys[i]];
      //console.log(maxref);
      //console.log(elementsofparticipant);
      //console.log(initiatingparticipant,participantkeys[i]);
      //console.log(startingpoint);
      //console.log(initiatingparticipant);
      //console.log(participantkeys[i]);
      if(initiatingparticipant===participantkeys[i]){
        //console.log("this");
        startingelement=startingpoint;
      }else{
        var test=this.elementRegistry.get(participantkeys[i]);
        if(typeof test=== 'undefined'){
          test = this.createNewParticipant(this.lastparticipantshape, rootElements,participantkeys[i]);
          var interactingParticipantShape = this.cli.element(test);
          //console.log(interactingParticipantShape.parent);
          this.lastparticipantshape=interactingParticipantShape.parent;
          var taskparticipantname = this.getParticipant(participants, participantkeys[i]);
          this.cli.setLabel(interactingParticipantShape.parent, taskparticipantname);
          startingelement=test;
        }else{
          
          startingelement=this.getLastElementOfParticipantBeforeEndEvent(participantkeys[i]);
          //console.log("something went wrong");
          //console.log(startingelement);
        }
      }
      


    var startevent = startingSituationalScope["bpmn2:startEvent"][0];

    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        var ischor=this.isChoreography(startingSituationalScope,node['$']['id']);
        for(var it=0;it<elementsofparticipant.length;it++){
          if(elementsofparticipant[it]===node){
            if(!ischor){

              positioningmapping[node['$']['id']] = 0;

         

            }
          }
        }
        visited.push(node);
        output.push(node);
      }
      //console.log(node);
      for(var el=0;el<Object.keys(elementmappinglist).length;el++){
        if(node['$']['id'] ===Object.keys(elementmappinglist)[el]){
          //console.log(startingelement);
          startingelement=elementmappinglist[node['$']['id']];
          //console.log(startingelement);

        }
      }
      for (let n of node['bpmn2:outgoing']) {


        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);

              
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgateway(startingSituationalScope, element);
          }
          //console.log(Object.keys(elementmappinglist));
          
          
          //console.log(startingelement);
          
          if (!visited.includes(finalelement)) {
            //console.log(startingelement);
            //console.log(finalelement);
              for(var it=0;it<elementsofparticipant.length;it++){
                if(elementsofparticipant[it]===finalelement){
                  var finalelementid=finalelement['$']['id'];
                  //console.log(elementsofparticipant[it]);
                  //console.log(node);
                  if(maxref>currentref){
                    //console.log(node['$']['id']);
                    //console.log(elementmappinglist[node['$']['id']]);
                    //console.log(positioningmapping[node['$']['id']]);
                    if (nextelement[0]) {
                      var lastvalidelement = this.getvalidpreviouselement(node, positioningmapping, startingSituationalScope);
                      var sendtaskposition_y=positioningmapping[lastvalidelement['$']['id']]*100;
                      var sendtaskposition='150,'+sendtaskposition_y;
                      //console.log(finalelement);
                      //console.log(sendtaskposition);
                      if(participantkeys[i]===finalelement['$']['initiatingParticipantRef']){
                        var adaptionsendmessagetask = this.cli.append(startingelement, 'bpmn:SendTask',sendtaskposition);
                        startingelement=adaptionsendmessagetask;
                        this.cli.setLabel(adaptionsendmessagetask,finalelement['$']['name']);
                        //console.log(sendtaskposition);

                        elementmappinglist[finalelementid]=adaptionsendmessagetask;
                        var mappingsend=[adaptionsendmessagetask,true];
                        globalchortaskmapping[finalelementid].push(mappingsend);
            
                        
                        
                      }else{
                        var adaptionreceivemessagetask = this.cli.append(startingelement, 'bpmn:ReceiveTask',sendtaskposition);
                        startingelement=adaptionreceivemessagetask;
                        this.cli.setLabel(adaptionreceivemessagetask,finalelement['$']['name']);
                        //console.log(sendtaskposition);

                        elementmappinglist[finalelementid]=adaptionreceivemessagetask;
                        var mappingreceive=[adaptionreceivemessagetask,false];

                        globalchortaskmapping[finalelementid].push(mappingreceive);
            
                       
                      }
                      //console.log(JSON.stringify(elementmappinglist));
                      currentref+=1;
                      //console.log(currentref);
                      //console.log(finalelement);
                    }else{
                      //console.log(node);
                      //console.log(positioningmapping[node['$']['id']]);
                      var sendtaskposition_y=positioningmapping[node['$']['id']]*100;
                      var sendtaskposition='150,'+sendtaskposition_y;
                      var newgateway=this.appendgateway(startingSituationalScope,finalelementid,startingelement,sendtaskposition);
                      startingelement=newgateway[1];
                      //console.log(finalelementid);
                      //console.log(newgateway[1]);
                      elementmappinglist[finalelementid]=newgateway[1];



                    }


                    if(typeof elementsofparticipant[it+1]!== 'undefined'){
                      if(this.checkforendevent(startingSituationalScope,elementsofparticipant[it+1]['$']['id'])){
                        var ending=elementsofparticipant[it+1];
                        var endelement=this.cli.append(startingelement,'bpmn:EndEvent');
                        elementmappinglist[elementsofparticipant[it+1]['$']['id']]=endelement;
                        console.log(participantkeys[i]);
                        console.log(endelement);
                        if(setglobalendevent){
                          this.endeventmapping[participantkeys[i]]=endelement;

                        }else{
                          if(initiatingparticipant!==participantkeys[i]){
                            this.endeventmapping[participantkeys[i]]=endelement;

                          }
                        }
                      }
                    }

                  }else if(maxref===currentref){

                    for(var rem=0;rem<elementsofparticipant.length;rem++){
                      if(elementsofparticipant[rem]['$']['id']===finalelement['$']['id']){
                        //console.log(elementsofparticipant[rem]);
                        elementsofparticipant.splice(rem,1);
                      }
                    }
                  }
                  

                  
                  
                }
              }
              //console.log(finalelement);
              //console.log(node);
              //console.log(JSON.stringify(elementmappinglist));
              //console.log(JSON.stringify(positioningmapping));

                      var isch=this.isChoreography(startingSituationalScope,node['$']['id']);
              for(var oth=0;oth<elementsofparticipant.length;oth++){
                if(elementsofparticipant[oth]===node){
                  if(!isch){            
                    positioningmapping[node['$']['id']] =positioningmapping[node['$']['id']]+1;
                  }
                }
              }
              //console.log(JSON.stringify(positioningmapping));

              for (let m of finalelement['bpmn2:outgoing']) {

                var moar = this.checknextelement(startingSituationalScope, m);
                if (!this.checkforendevent(startingSituationalScope, moar[1])) {
                  var next;
                  if (moar[0]) {
                    next = this.findChoreographyTask(startingSituationalScope, moar[1]);
                    
                      
                  }
                  else {
                    var elem = this.getTargetFromSequenceflow(startingSituationalScope, m);
                    next = this.getgateway(startingSituationalScope, elem);
                  }
                  if (visited.includes(next)) {
                    for(var thi=0;thi<elementsofparticipant.length;thi++){
                      if(elementsofparticipant[thi]===next){
                        //console.log(next);
                        //console.log(elementmappinglist);

                        var appendingelements=elementmappinglist[next['$']['id']];
                        //console.log(appendingelements);
                        var ting=this.cli.connect(startingelement,appendingelements,'bpmn:SequenceFlow', '150,0');

                      }
                    }
                  }
                }  
              }

            stack.push(finalelement);
            continue stackloop;
          }
        }else{
/*
          
        */}
      }
      stack.pop();
    } 
    //console.log(visitedparticipantsarraylist);        
    //console.log(elementmappinglist);
    //console.log(globalchortaskmapping);
    //console.log(participantkeys[i]);
    //console.log(positioningmapping);
    var collabo;

    if((typeof evaluationSubprocess !=='undefined')&&(initiatingparticipant===participantkeys[i])){
      collabo= this.cli.element(evaluationSubprocess);

    }else{
      collabo= this.cli.element(participantkeys[i]);

    }
    //console.log(participantkeys[i]);
    //console.log(collabo);
    var hasendevent=false;
    for(var endEventIterator=0;endEventIterator<collabo.children.length;endEventIterator++){
      if(collabo.children[endEventIterator].type=="bpmn:EndEvent"){
      hasendevent=true; 
      }
      //this.cli.setLabel(partendevent,"Evaluate")
    }
    if(hasendevent===false){
      var endelement=this.cli.append(startingelement,'bpmn:EndEvent');
      if(setglobalendevent){
        this.endeventmapping[participantkeys[i]]=endelement;

      }else{
        if(initiatingparticipant!==participantkeys[i]){
          this.endeventmapping[participantkeys[i]]=endelement;

        }
      }

      for(var check=0;check<elementsofparticipant.length;check++){
        if(this.checkforendevent(startingSituationalScope,elementsofparticipant[check]['$']['id'])){
          elementmappinglist[elementsofparticipant[check]['$']['id']]=endelement;

        }
      }

    }

    }
    this.addmessages(startingSituationalScope,globalchortaskmapping);
   // return startingelement;
  }

  getvalidpreviouselement(node, positioningmapping, startingSituationalScope) {
    var lastvalidelement = node;
    //console.log(lastvalidelement);

    if(typeof lastvalidelement['bpmn2:incoming']!=='undefined'){

    if (typeof positioningmapping[lastvalidelement['$']['id']] === 'undefined') {
        var iterate = this.checkpreviouselement(startingSituationalScope, lastvalidelement['bpmn2:incoming']);
        //console.log(iterate);
        var previouselement;
        if (iterate[0]) {
          previouselement = this.findChoreographyTask(startingSituationalScope, iterate[1]);
        }
        else {
          var newelement = this.getSourceFromSequenceflow(startingSituationalScope, lastvalidelement['bpmn2:incoming']);
          previouselement = this.getgateway(startingSituationalScope, newelement);
        }
        if(typeof previouselement!== 'undefined'){
          lastvalidelement = previouselement;
          //console.log(lastvalidelement);
          this.getvalidpreviouselement(lastvalidelement,positioningmapping,startingSituationalScope);
        }
        
      }
      
    }
    return lastvalidelement;
  }

  getvalidpreviousSituation(currentsit, allsequenceflows, allsituations) {
    var lastvalidelement = currentsit;
    //console.log(lastvalidelement);
    console.log(lastvalidelement);
    if(typeof lastvalidelement['bpmn2:incoming']!=='undefined'){
      var previoussituation=this.getSitscopefromFlowSource(lastvalidelement['bpmn2:incoming'],allsequenceflows,allsituations);

      console.log(previoussituation);
      if(typeof previoussituation['bpmn2:incoming']!=='undefined'){
    if (typeof previoussituation['bpmn2:subProcess'] === 'undefined') {

          console.log(lastvalidelement);
          lastvalidelement=this.getvalidpreviousSituation(previoussituation,allsequenceflows,allsituations);
        }else{
          console.log(previoussituation);
          return previoussituation;
        }
        
      }
      
    }
    console.log(lastvalidelement);
    return lastvalidelement;
  }

  getSitscopefromFlowSource(sequenceflow,allsequenceflows,allsituations){
    var sourcereference;
    for(var seq=0;seq<allsequenceflows.length;seq++){
      if (allsequenceflows[seq].$.id == sequenceflow) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        sourcereference = allsequenceflows[seq].$.sourceRef;
      }
    }
    var fittingsituation=this.findSituationalScope(allsituations,sourcereference);
    return fittingsituation;

  }

  getLastElementOfParticipantBeforeEndEvent(participantname){
    var collabo = this.cli.element(participantname);
    console.log(participantname);
    //console.log(collabo);
    var partendevent;
    if(typeof this.elementRegistry.get(this.endeventmapping[participantname])!=='undefined'){
      var partendevent=this.cli.element(this.endeventmapping[participantname]);

    }else{
      for(var endEventIterator=0;endEventIterator<collabo.children.length;endEventIterator++){
        if(collabo.children[endEventIterator].type=="bpmn:EndEvent"){
          partendevent=this.cli.element(collabo.children[endEventIterator].id);
        }
        //this.cli.setLabel(partendevent,"Evaluate")
      }
    }
    

    //console.log(partendevent.incoming[0].businessObject.sourceRef.id);
    var lastmessagetask=this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
    //console.log(lastmessagetask);
    this.cli.removeShape(partendevent);
    return lastmessagetask;
  }
  getNumberOfParticipantsOfChorProcess(startingSituationalScope) {
    var visitedparticipants = {};
    var visitedparticipantsarraylist={};
    var startevent = startingSituationalScope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];
    var output = [];
    var endelement;
    var globalchortaskmapping={};
    var listofgateways=[];
    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
        output.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgateway(startingSituationalScope, element);
            //console.log(finalelement);
            if(finalelement in listofgateways){
              listofgateways.push(finalelement);

            }else{
              listofgateways=[finalelement];
            }

          }
          if (!visited.includes(finalelement)) {
            if (nextelement[0]) {
              var finalelementid=finalelement['$']['id'];
              for (let m of finalelement['bpmn2:participantRef']) {
                if (m in visitedparticipants) {
                  visitedparticipants[m] = visitedparticipants[m] + 1;
                  visitedparticipantsarraylist[m].push(finalelement);

                }
                else {
                  visitedparticipants[m] = 1;
                  visitedparticipantsarraylist[m]=[finalelement];

                }
              }
              if (finalelementid in Object.keys(globalchortaskmapping)) {
                //globalchortaskmapping[finalelementid].push(adaptionsendmessagetask);
  
              }
              else {
                globalchortaskmapping[finalelementid]=[];
  
              }
            }else{
              for (let n of Object.keys(visitedparticipants)) {
                if (n in visitedparticipantsarraylist) {
                  visitedparticipantsarraylist[n].push(finalelement);

                }
                else {
                  visitedparticipantsarraylist[n]=[finalelement];

                }
              }
            }
            stack.push(finalelement);
            continue stackloop;
          }
        }else{
          endelement=this.getEndevent(startingSituationalScope, nextelement[1]);
          for (let n of Object.keys(visitedparticipants)) {
            if (n in visitedparticipantsarraylist) {
              visitedparticipantsarraylist[n].push(endelement);

            }
            else {
              visitedparticipantsarraylist[n]=[endelement];

            }
          }
        }
      }
      stack.pop();
    }
    for(let allpart of Object.values(visitedparticipantsarraylist)){
      var containsend=false;
      for(let element of allpart){
        if(element===endelement){
          containsend=true;
        }

      }
      if(containsend===false){
        allpart.push(endelement);
      }

    }
    if(listofgateways.length){
      for (const [key, value] of Object.entries(visitedparticipantsarraylist)) {
          for(let allgateways of listofgateways){
            var containsgate=false;
              for(let allvalues of value){
                if (allgateways['$']['id'] ===allvalues['$']['id']){
                  containsgate=true;

                }
              }
              
              if(visitedparticipants[key]>1){

          if(containsgate===false){
            value.push(allgateways);
          }
          }
  
        }
        
      }
    }

    //console.log(listofgateways);

    //console.log(visitedparticipants);
    //console.log(visitedparticipantsarraylist);
    return [visitedparticipants,visitedparticipantsarraylist,globalchortaskmapping];
  }

  addmessages(startingSituationalScope,globalmapping) {
    var startevent = startingSituationalScope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];

    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgateway(startingSituationalScope, element);
          }
          if (!visited.includes(finalelement)) {
            if (nextelement[0]) {
              var finalelementid=finalelement['$']['id'];
              var mappingarray=globalmapping[finalelementid];
              if(mappingarray[0][1]===true){
                var send=this.cli.element(mappingarray[0][0]);
                var receive=this.cli.element(mappingarray[1][0]);
                var con=this.cli.connect(send,receive,'bpmn:MessageFlow');
                this.cli.setLabel(con,finalelement['$']['name']);
              }else{
                var send=this.cli.element(mappingarray[1][0]);
                var receive=this.cli.element(mappingarray[0][0]);
                var con=this.cli.connect(send,receive,'bpmn:MessageFlow');
                this.cli.setLabel(con,finalelement['$']['name']);
              }
             
            }
            stack.push(finalelement);
            continue stackloop;
          }
        
          
        }
      }
      stack.pop();
    }
    

  }
  getValidFirstChoreographyTask(startingSituationalScope) {
    var startevent = startingSituationalScope["bpmn2:startEvent"][0];
    var stack = [];
    var visited = [];

    stack.push(startevent);
    stackloop: while (stack.length) {
      var node = stack[stack.length - 1];
      if (!visited.includes(node)) {
        visited.push(node);
      }
      for (let n of node['bpmn2:outgoing']) {
        var nextelement = this.checknextelement(startingSituationalScope, n);
        if (!this.checkforendevent(startingSituationalScope, nextelement[1])) {
          var finalelement;
          if (nextelement[0]) {
            finalelement = this.findChoreographyTask(startingSituationalScope, nextelement[1]);
            return finalelement;
          }
          else {
            var element = this.getTargetFromSequenceflow(startingSituationalScope, n);
            finalelement = this.getgateway(startingSituationalScope, element);
          }
          if (!visited.includes(finalelement)) {

            stack.push(finalelement);
            continue stackloop;
          }
        
          
        }
      }
      stack.pop();
    }
    

    return 'undefined';
  }
  getTargetFromSequenceflow(situationalScope,sequenceflowid){
    var sequenceflows=situationalScope["bpmn2:sequenceFlow"];
    for(var seq=0;seq<sequenceflows.length;seq++){
      if (sequenceflows[seq].$.id == sequenceflowid) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.targetRef;
      }
    }
  }
  getSourceFromSequenceflow(situationalScope,sequenceflowid){
    var sequenceflows=situationalScope["bpmn2:sequenceFlow"];
    for(var seq=0;seq<sequenceflows.length;seq++){
      if (sequenceflows[seq].$.id == sequenceflowid) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        return sequenceflows[seq].$.sourceRef;
      }
    }
  }

  findAppendedSituationalScopes(startingSituationalScope, sequenceFlows, subProcesses, participants, fittingParticipantName, participantshape, rootElements, adaptiondecision) {
   //console.log(startingSituationalScope);
    var sitscopeoutgoingflows = startingSituationalScope["bpmn2:outgoing"];
    if(typeof sitscopeoutgoingflows!=='undefined'){
      for (var i = 0; i < sitscopeoutgoingflows.length; i++) {
        for (var j = 0; j < sequenceFlows.length; j++) {
          if (sitscopeoutgoingflows[i] == sequenceFlows[j].$.id) {
            //console.log(sequenceFlows[j].$.targetRef);
            if ((sequenceFlows[j].$.flowtype === "Adapt")||typeof sequenceFlows[j].$.flowtype === 'undefined') {
              //console.log(sequenceFlows[j].$.flowtype);
              var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
              //console.log("Adapt");
              //console.log(sit);
              var setglobalendevent=false;
              this.executeChoreographyTaskTreeWalker(sit,participants,rootElements,fittingParticipantName,adaptiondecision,undefined,setglobalendevent);
              //this.createAllParticipantsOfSitScope(participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, sit);
  
              if (typeof sit["bpmn2:outgoing"] !== 'undefined') {
  
                this.findAppendedSituationalScopes(sit,sequenceFlows,subProcesses,participants,fittingParticipantName,participantshape,rootElements,adaptiondecision);
               //console.log("available stuff");
              }
              
            }
            
            else if(sequenceFlows[j].$.flowtype === "Continue"){
              //console.log(sequenceFlows[j].$.flowtype);
              var sit = this.findSituationalScope(subProcesses, sequenceFlows[j].$.targetRef);
              //console.log("Continue");
              var evaluationprocess=sit['bpmn2:subProcess'][0];

              var chortask = this.findStartingChoreographyTask(evaluationprocess);
              //console.log(chortask);
              if(typeof chortask==='undefined'){
                var sitstartevent= sit['bpmn2:startEvent'][0]['bpmn2:outgoing'][0];
                
 
                chortask = this.checkforchortask(sit, sitstartevent);
              }

              /*
              var collabo = this.cli.element(chortask.$.initiatingParticipantRef);
              //console.log(collabo);
              var partendevent;
              for(var endEventIterator=0;endEventIterator<collabo.children.length;endEventIterator++){
                if(collabo.children[endEventIterator].type=="bpmn:EndEvent"){
                  partendevent=this.cli.element(collabo.children[endEventIterator].id);
                }
                //this.cli.setLabel(partendevent,"Evaluate")
              }
              this.cli.removeShape(partendevent);

              //console.log(partendevent.incoming[0].businessObject.sourceRef.id);
              var lastmessagetask=this.cli.element(partendevent.incoming[0].businessObject.sourceRef.id);
              */
              var lastmessagetask=this.getLastElementOfParticipantBeforeEndEvent(chortask.$.initiatingParticipantRef);
              //console.log(lastmessagetask);
              var isContinuePath=true;
              this.createEvaluationProcess(isContinuePath,lastmessagetask, chortask, chortask.$.initiatingParticipantRef, participants, participantshape, rootElements, sit, sequenceFlows, subProcesses, fittingParticipantName);

              //var partendevent= this.bpmnReplace.replaceElement(partendevent, {
              //  type: "bpmn:Task"                
              //});
              
  
              //console.log(sequenceFlows[j].$.flowtype);
            }
          }
        }
      }
    }

  }

  checkforchortask(sit, sequenceflow) {
    var situationsequenceFlows = sit["bpmn2:sequenceFlow"];
    var targetelement;
    var chortask;
    for(var seq=0;seq<situationsequenceFlows.length;seq++){
      if (situationsequenceFlows[seq].$.id == sequenceflow) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        targetelement = situationsequenceFlows[seq].$.targetRef;
      }
    }
    //console.log(targetelement);
    var currentgateway = this.getgateway(sit, targetelement);
    
    var outgoinggatewayflows = currentgateway["bpmn2:outgoing"];
   //console.log(outgoinggatewayflows);
      for (var gatewayiterator = 0; gatewayiterator<outgoinggatewayflows.length; gatewayiterator++) {
        var elementcheck=this.checknextelement(sit,outgoinggatewayflows[gatewayiterator]);
        if(elementcheck[0]!==true){
          //console.log(outgoinggatewayflows[gatewayiterator]);
          if(this.checkforendevent(sit,elementcheck[1])!==true){
            this.checkforchortask(sit,outgoinggatewayflows[gatewayiterator],chortask);

          }
        }else{
          chortask=this.findChoreographyTask(sit, elementcheck[1]);
        }
      }
    
    
    return chortask;
  }

  createAllParticipantsOfSitScope( participants, fittingParticipantName, participantshape, rootElements, adaptiondecision, situationscope,chortask,fittingsituationsequenceflow) {
    var appendedelement=adaptiondecision;
    var currentfittingsituationsequenceflow;
    //console.log(fittingsituationsequenceflow);
    var elementcheck=this.checknextelement(situationscope,fittingsituationsequenceflow);
    
    var currentchortask=chortask;
    //console.log(elementcheck[0]);
    //console.log(elementcheck[1]);
    currentfittingsituationsequenceflow=elementcheck[1];
    var situationsequenceflows=situationscope["bpmn2:sequenceFlow"];
    var situationendevents=situationscope["bpmn2:endEvent"];
    var choreographytasks=situationscope["bpmn2:choreographyTask"];

    if(elementcheck[0]!==true){
      var foundchoreography;
      var foundgateway=this.appendgateway(situationscope,elementcheck[1],appendedelement);
      if(typeof foundgateway[0]!=='undefined'){
        appendedelement=foundgateway[1];

        var gatewaysequenceflows=foundgateway[0]["bpmn2:outgoing"];
        for(var outgoingvalues=0;outgoingvalues<gatewaysequenceflows.length;outgoingvalues++){
          var fittingsituationsequenceflow;
          for (var i = 0; i < situationsequenceflows.length; i++) {
          // look the sequenceflow which belongs to the start event inside the situationalscope
            if (situationsequenceflows[i].$.id == gatewaysequenceflows[outgoingvalues]) {
              //console.log(situationsequenceflows[i].$.id);
              fittingsituationsequenceflow = situationsequenceflows[i].$.id;
            }
          }
          for (var i = 0; i < choreographytasks.length; i++) {
          // look for the choreography task belonging to the sequenceflow
            if (choreographytasks[i].$.id == fittingsituationsequenceflow) {
              //console.log("find it");
              foundchoreography= choreographytasks[i];
            }
    
        }
        //console.log(foundgateway);
        //console.log(gatewaysequenceflows[outgoingvalues]);
  
    
        this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope,foundchoreography,fittingsituationsequenceflow);
          //this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,appendedelement,situationscope);
        }
      }else{
        //console.log("adapt");
        var endadaptionevent = this.cli.append(appendedelement, 'bpmn:EndEvent');
      }

      

    }else{
      if(typeof currentchortask==='undefined'){
        currentchortask = this.findChoreographyTask(situationscope,currentfittingsituationsequenceflow);

      }

      var taskparticipants = currentchortask["bpmn2:participantRef"];
      var taskoutgoingsequenceflows=currentchortask["bpmn2:outgoing"];
      //console.log(currentchortask);
  
  
      //console.log(chortask);
      //console.log(situationscope);
      var taskpositioncounter=0;
  
      if(typeof choreographytasks !== 'undefined'){
        for(var chorincrement=0;chorincrement<choreographytasks.length;chorincrement++){
          if(currentchortask.$.id==choreographytasks[chorincrement].$.id){
      for (var k = 0; k < taskparticipants.length; k++) {
        var taskparticipantname = this.getParticipant(participants, taskparticipants[k]);
        //console.log(situationscope);
        //console.log(chortask);
  
        //console.log(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined');
        if (taskparticipantname != fittingParticipantName) {
          if(typeof this.elementRegistry.get(taskparticipants[k]) ==='undefined'){
            var newinteractingparticipant = this.createNewParticipant(this.lastparticipantshape, rootElements,taskparticipants[k]);
            var newinteractingParticipantShape = this.cli.element(newinteractingparticipant);
            //console.log(taskparticipants[k]);
            //console.log(newinteractingParticipantShape.parent);
            this.cli.setLabel(newinteractingParticipantShape.parent, taskparticipantname);
            this.lastparticipantshape=newinteractingParticipantShape.parent;
            var sendtaskposition_y=this.taskpositioncounter*100;
            var sendtaskposition='150,'+sendtaskposition_y;
            //console.log(sendtaskposition);
            var adaptionmessagetask = this.cli.append(appendedelement, 'bpmn:SendTask', sendtaskposition);
            this.taskpositioncounter++;
            var adaptionreceivemessagetask = this.cli.append(newinteractingparticipant, 'bpmn:ReceiveTask', '150,0');
            var interactionmessage = this.cli.connect(adaptionmessagetask, adaptionreceivemessagetask, 'bpmn:MessageFlow', '150,0');
            this.cli.setLabel(interactionmessage, currentchortask.$.name);
            //console.log("partscopes");
            var endadaptionreceiveevent = this.cli.append(adaptionreceivemessagetask, 'bpmn:EndEvent');
            for(var m=0;m<taskoutgoingsequenceflows.length;m++){
              for(var l=0;l<situationsequenceflows.length;l++){
                if(taskoutgoingsequenceflows[m]== situationsequenceflows[l].$.id){
                    console.log(situationsequenceflows[l].$.targetRef);
  
                  var foundendevent=false;
                  for(var n=0;n<situationendevents.length;n++){
                    if(situationsequenceflows[l].$.targetRef==situationendevents[n].$.id){
                      foundendevent=true;
                    }
                  }
                  if(foundendevent){
                    //console.log("Endevent");
                    var endadaptionevent = this.cli.append(adaptionmessagetask, 'bpmn:EndEvent');
                    
                  }else{
                    var followingchoreography=this.findChoreographyTask(situationscope,situationsequenceflows[l].$.targetRef)
                    //console.log("noendevent");
                    //enable gateways and events
                    //console.log(followingchoreography);
                    this.taskpositioncounter=0;
                    this.createAllParticipantsOfSitScope(participants,fittingParticipantName,participantshape,rootElements,adaptionmessagetask,situationscope,followingchoreography,situationsequenceflows[l].$.id);
                  }
                }
              }
            }
          }
        }
      }
          }
        }
     }
    }
    

  }
  checkforendevent(sit,elementname){
    var situationendevents=sit["bpmn2:endEvent"];
    for(var n=0;n<situationendevents.length;n++){
      if(elementname==situationendevents[n].$.id){
        return true      
      }
    }

  }

  getEndevent(sit,elementname){
    var situationendevents=sit["bpmn2:endEvent"];
    for(var n=0;n<situationendevents.length;n++){
      if(elementname==situationendevents[n].$.id){
        return situationendevents[n];      
      }
    }
  }
  getParticipant(participants, participantref) {
    for (var i = 0; i < participants.length; i++) {
      // look for the entry with a matching `code` value
      if (participants[i].$.id == participantref) {
        return participants[i].$.name;
        // obj[i].name is the matched result
      }
    }
    
  }
  checknextelement(situationalScope,outgoingelement){
    
    var situationchoreographytask = situationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = situationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = outgoingelement;
    var targetid;
    var foundsituationchoreographytask;
    //console.log("why not");
    //console.log(situationalScope);
    //console.log(outgoingsituationstart);
    if(typeof outgoingsituationstart==='undefined'){
      //console.log("why");
      var situationstart = situationalScope["bpmn2:startEvent"][0];
      //console.log(situationstart);

      outgoingsituationstart=situationstart["bpmn2:outgoing"][0];
      //console.log(outgoingsituationstart);

    }
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        targetid = situationsequenceFlows[i].$.targetRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == targetid) {
        //console.log("find it");
        return [true,targetid];
      }

    }
    if(typeof foundsituationchoreographytask==='undefined'){
          return [false,targetid];
        
      
    }
  }
  checkpreviouselement(situationalScope,outgoingelement){
    
    var situationchoreographytask = situationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = situationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = outgoingelement;
    var targetid;
    var foundsituationchoreographytask;
    //console.log("why not");
    //console.log(situationalScope);
    //console.log(outgoingsituationstart);

    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        //console.log(situationsequenceFlows[i].$.targetRef);
        targetid = situationsequenceFlows[i].$.sourceRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == targetid) {
        //console.log("find it");
        return [true,targetid];
      }

    }
    if(typeof foundsituationchoreographytask==='undefined'){
          return [false,targetid];
        
      
    }
  }


  findStartingChoreographyTask(startingSituationalScope) {
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var outgoingsituationstart = situationstart["bpmn2:outgoing"][0];
    var fittingsituationsequenceflow;
    var foundsituationchoreographytask;
    for (var i = 0; i < situationsequenceFlows.length; i++) {
      // look the sequenceflow which belongs to the start event inside the situationalscope
      if (situationsequenceFlows[i].$.id == outgoingsituationstart) {
        fittingsituationsequenceflow = situationsequenceFlows[i].$.targetRef;
      }
    }
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the choreography task belonging to the sequenceflow
      if (situationchoreographytask[i].$.id == fittingsituationsequenceflow) {
        foundsituationchoreographytask= situationchoreographytask[i];
      }

    }
    
    return foundsituationchoreographytask;
  }
  appendgateway(startingSituationalScope,gatewayid,appendedelement,position){
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];
    var sendtaskposition_y;
    var sendtaskposition;
    if(typeof position !=='undefined'){
    sendtaskposition_y=this.taskpositioncounter*100;
    sendtaskposition='150,'+sendtaskposition_y;
    }
    else {sendtaskposition=position};
    var situationeventBasedGateway=startingSituationalScope["bpmn2:eventBasedGateway"];
    var situationcomplexGateway=startingSituationalScope["bpmn2:complexGateway"];
    var situationexclusiveGateway=startingSituationalScope["bpmn2:exclusiveGateway"];
    var situationinclusiveGateway=startingSituationalScope["bpmn2:inclusiveGateway"];
    var situationparallelGateway=startingSituationalScope["bpmn2:parallelGateway"];
    var choreographytasks=startingSituationalScope["bpmn2:choreographyTask"];
    var foundgateway;
    var newappendix;
    
    //console.log(startingSituationalScope);
    //console.log(fittingsituationsequenceflow);
    if(typeof situationexclusiveGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationexclusiveGateway.length;n++){
        //console.log(situationexclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationexclusiveGateway[n].$.id==gatewayid){
          foundgateway = situationexclusiveGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ExclusiveGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationeventBasedGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationeventBasedGateway.length;n++){
        //console.log(situationeventBasedGateway[n]['$']["bpmn:incoming"]);
        if(situationeventBasedGateway[n].$.id==gatewayid){
          foundgateway = situationeventBasedGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:EventBasedGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationcomplexGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationcomplexGateway.length;n++){
        //console.log(situationcomplexGateway[n]['$']["bpmn:incoming"]);
        if(situationcomplexGateway[n].$.id==gatewayid){
          foundgateway = situationcomplexGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ComplexGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationinclusiveGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationinclusiveGateway.length;n++){
        //console.log(situationinclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationinclusiveGateway[n].$.id==gatewayid){
          foundgateway = situationinclusiveGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:InclusiveGateway',sendtaskposition);

        }
      }
  
    }
    if(typeof situationparallelGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationparallelGateway.length;n++){
        //console.log(situationparallelGateway[n]['$']["bpmn:incoming"]);
        if(situationparallelGateway[n].$.id==gatewayid){
          foundgateway = situationparallelGateway[n];
          newappendix=this.cli.append(appendedelement, 'bpmn:ParallelGateway',sendtaskposition);

        }
      }
  
    }
    return [foundgateway,newappendix];
    /*
     */

    
  }
  getgateway(startingSituationalScope,elementid){
    var situationstart = startingSituationalScope["bpmn2:startEvent"][0];
    var situationsequenceFlows = startingSituationalScope["bpmn2:sequenceFlow"];
    var situationchoreographytask = startingSituationalScope["bpmn2:choreographyTask"];

    var situationeventBasedGateway=startingSituationalScope["bpmn2:eventBasedGateway"];
    var situationcomplexGateway=startingSituationalScope["bpmn2:complexGateway"];
    var situationexclusiveGateway=startingSituationalScope["bpmn2:exclusiveGateway"];
    var situationinclusiveGateway=startingSituationalScope["bpmn2:inclusiveGateway"];
    var situationparallelGateway=startingSituationalScope["bpmn2:parallelGateway"];
    var foundgateway;
    //console.log(startingSituationalScope);
    //console.log(fittingsituationsequenceflow);
    if(typeof situationexclusiveGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationexclusiveGateway.length;n++){
        //console.log(situationexclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationexclusiveGateway[n].$.id==elementid){
          foundgateway = situationexclusiveGateway[n];

        }
      }
  
    }
    if(typeof situationeventBasedGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationeventBasedGateway.length;n++){
        //console.log(situationeventBasedGateway[n]['$']["bpmn:incoming"]);
        if(situationeventBasedGateway[n].$.id==elementid){
          foundgateway = situationeventBasedGateway[n];

        }
      }
  
    }
    if(typeof situationcomplexGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationcomplexGateway.length;n++){
        //console.log(situationcomplexGateway[n]['$']["bpmn:incoming"]);
        if(situationcomplexGateway[n].$.id==elementid){
          foundgateway = situationcomplexGateway[n];

        }
      }
  
    }
    if(typeof situationinclusiveGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationinclusiveGateway.length;n++){
        //console.log(situationinclusiveGateway[n]['$']["bpmn:incoming"]);
        if(situationinclusiveGateway[n].$.id==elementid){
          foundgateway = situationinclusiveGateway[n];

        }
      }
  
    }
    if(typeof situationparallelGateway !=='undefined'){
      //console.log("test");
      for(var n=0;n<situationparallelGateway.length;n++){
        //console.log(situationparallelGateway[n]['$']["bpmn:incoming"]);
        if(situationparallelGateway[n].$.id==elementid){
          foundgateway = situationparallelGateway[n];

        }
      }
  
    }
    return foundgateway;
    /*
     */

    
  }
  
  findChoreographyTask(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope["bpmn2:choreographyTask"];

    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the entry with a matching `code` value
      if (situationchoreographytask[i].$.id == choreographyid) {
        return situationchoreographytask[i];
        // obj[i].name is the matched result
      }
    }
  }

  isChoreography(situationalscope, choreographyid) {
    var situationchoreographytask = situationalscope["bpmn2:choreographyTask"];
    var returnvalue=false;
    for (var i = 0; i < situationchoreographytask.length; i++) {
      // look for the entry with a matching `code` value
      if (situationchoreographytask[i].$.id == choreographyid) {
        returnvalue= true;
        // obj[i].name is the matched result
      }
    }
    return returnvalue;
  }

  findStartingSituationalScope(startEvent, sequenceFlows, subProcesses) {
    var outgoingstart = startEvent["bpmn2:outgoing"][0];
    var fittingsequenceflow;
    for (var i = 0; i < sequenceFlows.length; i++) {
      // find the sequenceflow belonging to the start event
      if (sequenceFlows[i].$.id == outgoingstart) {
        fittingsequenceflow = sequenceFlows[i].$.targetRef;
      }
    }

    for (var i = 0; i < subProcesses.length; i++) {
      // find the target situational scope
      if (subProcesses[i].$.id == fittingsequenceflow) {
        return subProcesses[i];
      }
    }
  }


  findSituationalScope(sitscopes, sitscopename) {
    for (var i = 0; i < sitscopes.length; i++) {
      // look for the entry with a matching `code` value
      if (sitscopes[i].$.id == sitscopename) {
        return  sitscopes[i];      // obj[i].name is the matched result
      }
    }

    
  }


  createNewParticipant(participantshape, rootElements,participantid) {
    var start = this.cli.create('bpmn:Participant', {
      x: participantshape.x + 200,
      y: participantshape.y + participantshape.height+200
    }, participantshape.parent);
    var participantshape2 = this.cli.element(start);
    //console.log(participantid);
    var test=this.elementRegistry.get(participantid);
    //console.log(test);
this.modeling.updateProperties(participantshape2,{id:participantid});    
    //console.log(participantshape2);

    var processelement = this.bpmnFactory.create('bpmn:Process');
    rootElements.push(processelement);
    participantshape2.businessObject.processRef = processelement;
    var start2 = this.cli.create('bpmn:StartEvent', {
      x: participantshape2.x ,
      y: participantshape2.y
    }, participantshape2);

    return start2;
  }
  }
    
    
ModelTransformer.$inject = [ 'bpmnjs','modeling','config',
 'eventBus', 'bpmnRenderer', 'textRenderer','cli','bpmnFactory','bpmnReplace','elementRegistry'];
