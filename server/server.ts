import { instrument } from '@socket.io/admin-ui'
import { Socket } from 'dgram'
import { Server } from 'socket.io'

const express = require('express')
const http = require('http')
const app = express()
const server = http.createServer(app)
const {Timeout} = require("managed-timeout")

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "https://admin.socket.io"],
        methods: ["GET", "POST"],
        credentials: true
    },
});


type Hero = "Countess" | "Crunch" | "Dekker" | "Drongo" | "FengMao" | "Fey" | "Gadget" | "Gideon" | "Greystone" | "Grux" | "Howitzer" | "Kallari" | "Khaimera" | "Kira" | "LtBelica" | "Morigesh" | "Murdock" | "Muriel" | "Narbash" | "Phase" | "Rampage" | "Revenant" | "Riktor" | "Sevarog" | "Shinbi" | "Sparrow" | "Steel" | "Twinblast" | "Zarus"

type SocketID = string 
type DraftLobby = {
    status: "waiting" | "team1Banning" | "team2Banning" | "team1Picking" | "team2Picking" | "finished",
    lobbyCode: string,
    settings: {
        mirrorMatchAllowed: "0" | "1",
        numPickBan: "0" | "1" | "2" | "3",
        aram: "0" | "1",
        team1Name: string,
        team2Name: string,
        playersNeeded: 2 | 10
    },
    owner: string,
    spectators: string[],
    players: Map<SocketID, Player>,
    heroes: Map<Hero, {Name: Hero, Status: "" | "banned" | "picked" | "hovered", Votes: number}>,
    bannedHeroesTeam1: Hero[],
    bannedHeroesTeam2: Hero[],
    inProgress: boolean,
    joinable: boolean,
    voteBansTeam1: Map<Hero, Set<SocketID>>,
    voteBansTeam2: Map<Hero, Set<SocketID>>,
    votePicksTeam1: Set<Hero>,
    votePicksTeam2: Set<Hero>,
    hoverTeam1: Map<Hero, Set<SocketID>>
    hoverTeam2: Map<Hero, Set<SocketID>>
    gameState : GameState,
    curTeamPick : number,
    curPickPhase: number,
    curPicksInPhase: number,
    tradeRequests: Map<SocketID, SocketID>,
}

interface Heroes {
  'Name': string,
  'Status': string,
  'Votes': number
}

interface Player{
  "Username":string,
  "SocketID":SocketID,
  "Status":string,
  "Hero":string,
  "Role": "Carry" | "Support" | "Midlane" | "Jungle" | "Offlane" | "None",
  "Team": 1 | 2 | 0
}

interface GameState{
    'Action': "waiting" | "team1Banning" | "team2Banning" | "team1Picking" | "team2Picking" | "finished" | "trading",
    'ActiveUser': PlayerActiveUser[],
    'Team1': string,
    'Team2': string,
    'Timer': number,
    'PlayerCount': number,
    'LobbyCode': string,
    'TimeoutID': any,
    "PlayersNeeded": 2 | 10,
  }

type PlayerActiveUser = Pick<Player, "Username" | "SocketID">;

interface Role{
    'RoleName': string,
  }

//generics can be used to create a function that can be used with different types
const heroMapToArray = (map: Map<Hero, Heroes>): Heroes[] => {
    return Array.from(map.entries()).map(([key, value]) => ({
      Name: value.Name,
      Status: value.Status,
      Votes: value.Votes,
    }));
  }

const playerMapToArray = (map: Map<SocketID, Player>): Player[] => {
    return Array.from(map.entries()).map(([key, value]) => ({
        Username: value.Username,
        SocketID: value.SocketID,
        Status: value.Status,
        Hero: value.Hero,
        Team: value.Team,
        Role: value.Role,
    }))
}

const Roles: Role[] = [
    { RoleName: "Carry" }, { RoleName: "Support" }, { RoleName: "Midlane" }, { RoleName: "Jungle" }, { RoleName: "Offlane" }
  ];

const draftLobbies = new Map<SocketID, DraftLobby>()

//creating a random number as lobbyID
const generateRandomHex = (length: number) => {
  const randomNumber = Math.random().toString(16);

  return randomNumber.substr(2, length);
};


//update hero votes
const heroVoteUpdater = (voteBans: Map<Hero, Set<SocketID>>, lobbyCode: string) => {
    Array.from(voteBans.entries()).forEach(([key, value]) => {
      console.log("Key - ", key, "Value - ", value);
      const heroVotes = value.size;
      console.log("Hero Votes - ", heroVotes);
      draftLobbies.get(lobbyCode)!.heroes.get(key)!.Votes = heroVotes;
    });
  }

//clear all hero votes
const heroWipe = (lobbyCode: string) => {
  draftLobbies.get(lobbyCode)!.heroes.forEach((hero: Heroes) => {
    draftLobbies.get(lobbyCode)!.heroes.get(hero.Name as Hero)!.Votes = 0;
  });
  draftLobbies.get(lobbyCode)!.voteBansTeam1.clear();
  draftLobbies.get(lobbyCode)!.voteBansTeam2.clear();
}

//update hero status hover
const hoverUpdater = (hoverTeam: Map<Hero, Set<SocketID>>, lobbyCode: string) => {
    console.log("Updating Hover state of heroes in lobby - ", lobbyCode)
    Array.from(hoverTeam.entries()).forEach(([key, value]) => {
        console.log("Key - ", key, "Value - ", value)
        if(value.size > 0) {
            if(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status === "picked" || draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status === "banned") {
                return
            }
            draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "hovered"
        } else {
            draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = ""
        }
    })
}


//update number of picks in current phase on hero pick
const heroPicked = (lobbyCode: string, hero: Hero) => {
    draftLobbies.get(lobbyCode)!.curPicksInPhase = draftLobbies.get(lobbyCode)!.curPickPhase + 1
}


//random heros if players not hovered a hero before timer runs out
const randomHero = (lobbyCode : string) => {
    return heroMapToArray(draftLobbies.get(lobbyCode)!.heroes).filter(hero => hero.Status !== "picked" && hero.Status !== "banned").map(hero => hero.Name)[Math.floor(Math.random() * heroMapToArray(draftLobbies.get(lobbyCode)!.heroes).filter(hero => hero.Status !== "picked" && hero.Status !== "banned").length)]
}


//removing hero status after lobby gets disbanded
const heroStatusWipe = (lobbyCode: string) => {
    draftLobbies.get(lobbyCode)!.heroes.forEach((hero: Heroes) => {
        if(draftLobbies.get(lobbyCode)!.heroes.get(hero.Name as Hero)!.Status == "picked") {
            draftLobbies.get(lobbyCode)!.heroes.get(hero.Name as Hero)!.Status == ""
        }
    })
}


//create pick phase logic 
const startTeamPick = (lobbyCode: string, socket: any, team: number, phase: number) => {
    if(draftLobbies.get(lobbyCode)!.gameState.Action == "finished") {
        return
    }
    if(draftLobbies.get(lobbyCode)!.curPickPhase > 6) {
        console.log("Draft is done!")
    }
    draftLobbies.get(lobbyCode)!.curPickPhase = team
    let player, player1
    switch(phase) {

        //START OF PHASE 1
        case 1:
        // Phase 1 - Confirm the very first pick 
        console.log("Phase 1");
        if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 1){
          console.log("Player didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
          // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
          const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
          if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
            let playerPickedHero = false;
            Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
              if(value.has(lastActiveUser1.SocketID)) {
                console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                playerPickedHero = true;
                console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status);
              }
            });
            if(!playerPickedHero){
              let hero = randomHero(lobbyCode);
              console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
              draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
              draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
              draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
            }
          } else {
            let picked = false;
            Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
              if(value.has(lastActiveUser1.SocketID)) {
                console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                picked = true;
                console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status);
              }
            });
            if(!picked){
              let hero = randomHero(lobbyCode);
              console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
              draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
              draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
              draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
            }
          }
        }
        if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
          // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[0];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[1];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team1Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
        } else {
          // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[0];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[1];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team2Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
        }
        break;

        //START OF PHASE 2 
        case 2:
          console.log("Phase 2")
          if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 2){
            console.log("Players didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
            // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
            const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
            const lastActiveUser2 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[1];
            if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            } else {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            }
          }
          if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[1];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[2];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team1Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          } else {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[1];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[2];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team2Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          }
          break;
        

        //START OF PHASE 3
        case 3:
          console.log("Phase 3");
          if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 2){
            console.log("Players didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
            // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
            const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
            const lastActiveUser2 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[1];
            if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            } else {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            }
          }
          if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[2];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[3];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team1Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          } else {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[2];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[3];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team2Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          }
          break;


        //START Of PHASE 4
        case 4:
          console.log("Phase 4");
          if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 2){
            console.log("Players didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
            // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
            const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
            const lastActiveUser2 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[1];
            if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            } else {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            }
          }
          if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[3];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[4];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team1Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          } else {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[3];
            player1 = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[4];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}, {Username: player1.Username, SocketID: player1.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team2Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player, player1];
          }
          break;


        //START OF PHASE 5
        case 5:
          console.log("Phase 5");
          if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 2){
            console.log("Players didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
            // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
            const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
            const lastActiveUser2 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[1];
            if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            } else {
              let player1PickedHero = false;
              let player2PickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser1.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player1PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }else if(value.has(lastActiveUser2.SocketID)) {
                  console.log("Found Hover for player - ", lastActiveUser2.Username, " Locking it in! ", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  player2PickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!player1PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
              if(!player2PickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser2.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser2.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            }
          }
          if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[4];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team1Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player];
          } else {
            // Get the first player in the team
            player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[4];
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            draftLobbies.get(lobbyCode)!.gameState.Action = "team2Picking";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [player];
          }
          break;


        //START OF PHASE 6
        case 6:
          console.log("Phase 6");
          if(draftLobbies.get(lobbyCode)!.curPicksInPhase < 1){
            console.log("Player didn't lock in their pick... Checking for hover", draftLobbies.get(lobbyCode)!.curPicksInPhase);
            // Get the last phase's players and see if they hovered a hero. If they did and they did not pick a hero, set their hero to the hero they hovered over
            const lastActiveUser1 = draftLobbies.get(lobbyCode)!.gameState.ActiveUser[0];
            if(draftLobbies.get(lobbyCode)!.gameState.Action == "team1Picking") {
              let playerPickedHero = false
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam1.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player! Locking it in!");
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  console.log(draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero);
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  playerPickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!playerPickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            } else {
              let playerPickedHero = false;
              Array.from(draftLobbies.get(lobbyCode)!.hoverTeam2.entries()).forEach(([key, value]) => {
                if(value.has(lastActiveUser1.SocketID)) {
                  console.log("Found Hover for player! Locking it in!", key);
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = key;
                  draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                  console.log(draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero);
                  draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status = "picked";
                  playerPickedHero = true;
                  console.log(draftLobbies.get(lobbyCode)!.heroes.get(key)!.Status)
                }
              });
              if(!playerPickedHero){
                let hero = randomHero(lobbyCode);
                console.log("No hover found for player - ", lastActiveUser1.Username, " Randomly picking a hero!");
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Hero = hero;
                draftLobbies.get(lobbyCode)!.players.get(lastActiveUser1.SocketID)!.Status = "picked";
                draftLobbies.get(lobbyCode)!.heroes.get(hero as Hero)!.Status = "picked";
              }
            }
          }
          if(draftLobbies.get(lobbyCode)!.settings.playersNeeded == 2){
            draftLobbies.get(lobbyCode)!.gameState.Action = "finished";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [];
          }else{
            console.log("FINISHED PICKING");
          }
          break;
        

        //START OF PHASE 7
        case 7:
            console.log("Phase 7");
            draftLobbies.get(lobbyCode)!.gameState.Action = "finished";
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [];
            break;
    }

    const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
    const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
    
    draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
    const gameState = draftLobbies.get(lobbyCode)!.gameState;
    console.log("Hero entries...", JSON.stringify(Array.from(draftLobbies.get(lobbyCode)!.heroes.entries())));
    const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);

    io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
    draftLobbies.get(lobbyCode)!.curPicksInPhase = 0;
    draftLobbies.get(lobbyCode)!.curPickPhase = draftLobbies.get(lobbyCode)!.curPickPhase + 1;
    console.log("Current Phase - ", draftLobbies.get(lobbyCode)!.curPickPhase);
    draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? draftLobbies.get(lobbyCode)!.curTeamPick = 2 : draftLobbies.get(lobbyCode)!.curTeamPick = 1;
    draftLobbies.get(lobbyCode)!.gameState.TimeoutID = new Timeout(() => startTeamPick(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick, draftLobbies.get(lobbyCode)!.curPickPhase), (draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500);
};


//create ban phase logic
const startTeamBan = (lobbyCode: string, socket: any, team: number, bans: 1 | 2) => {
    switch(bans) {
      case 1:
        setTimeout(function() {
          // Banning Logic
          let bannedHero = ""
          let highestVotes = 0;
          if(team == 1) {
            Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
              if(value.size > highestVotes) {
                highestVotes = value.size;
                bannedHero = key;
              }
            });
          } else {
            Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
              if(value.size > highestVotes) {
                highestVotes = value.size;
                bannedHero = key;
              }
            });
          }
          if(highestVotes == 0) {
            bannedHero = randomHero(lobbyCode);
          }
          console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
          if(team==1){
            draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
          }else{
            draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
          }
          draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
          heroWipe(lobbyCode);
  
          // State Changes
          draftLobbies.get(lobbyCode)!.gameState.Action = (team == 2 ? "team1Banning" : "team2Banning");
          draftLobbies.get(lobbyCode)!.gameState.ActiveUser = (team == 2 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team1, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}]);
          draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
  
          const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
          const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
  
          const gameState = draftLobbies.get(lobbyCode)!.gameState;
            
          const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
          io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
          // Start Timer for next ban
          setTimeout(function() {
            // Banning Logic
            let bannedHero = ""
            let highestVotes = 0;
            if(team == 2) {
              Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
                if(value.size > highestVotes) {
                  highestVotes = value.size;
                  bannedHero = key;
                }
              });
            } else {
              Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
                if(value.size > highestVotes) {
                  highestVotes = value.size;
                  bannedHero = key;
                }
              });
            }
            if(highestVotes == 0) {
              bannedHero = randomHero(lobbyCode);
            }
            console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
            if(team==2){
              draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
            }else{
              draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
            }
            draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
            heroWipe(lobbyCode);
  
            // State Changes
            draftLobbies.get(lobbyCode)!.gameState.Action = (team == 1 ? "team1Picking" : "team2Picking");
            if(team == 1) {
              // Get the first player in the team
              const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[0];
              draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            } else {
              // Get the first player in the team
              const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[0];
              draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            }          
            draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
  
            const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
            const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
  
            const gameState = draftLobbies.get(lobbyCode)!.gameState;
              
            const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
            io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
            draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? draftLobbies.get(lobbyCode)!.curTeamPick = 2 : draftLobbies.get(lobbyCode)!.curTeamPick = 1;
            draftLobbies.get(lobbyCode)!.gameState.TimeoutID = new Timeout(() => startTeamPick(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick, draftLobbies.get(lobbyCode)!.curPickPhase), (draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500);
          }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
        }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
        break;
      case 2:
        setTimeout(function() {
          // Banning Logic
          let bannedHero = ""
          let highestVotes = 0;
          if(team == 1) {
            Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
              if(value.size > highestVotes) {
                highestVotes = value.size;
                bannedHero = key;
              }
            });
          } else {
            Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
              if(value.size > highestVotes) {
                highestVotes = value.size;
                bannedHero = key;
              }
            });
          }
          if(highestVotes == 0) {
            bannedHero = randomHero(lobbyCode);
          }
          console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
          if(team==1){
            draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
          }else{
            draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
          }
          draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
          heroWipe(lobbyCode);
  
          // State Changes
          draftLobbies.get(lobbyCode)!.gameState.Action = (team == 2 ? "team1Banning" : "team2Banning");
          draftLobbies.get(lobbyCode)!.gameState.ActiveUser = (team == 2 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team1, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}]);
          draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
  
          const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
          const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
  
          const gameState = draftLobbies.get(lobbyCode)!.gameState;
            
          const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
          io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
          // Start Timer for next ban
          setTimeout(function() {
            // Banning Logic
            let bannedHero = ""
            let highestVotes = 0;
            if(team == 2) {
              Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
                if(value.size > highestVotes) {
                  highestVotes = value.size;
                  bannedHero = key;
                }
              });
            } else {
              Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
                if(value.size > highestVotes) {
                  highestVotes = value.size;
                  bannedHero = key;
                }
              });
            }
            if(highestVotes == 0) {
              bannedHero = randomHero(lobbyCode);
            }
            console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
            if(team == 2){
              draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
            }else{
              draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
            }
            draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
            
            heroWipe(lobbyCode);
  
            // State Changes
            draftLobbies.get(lobbyCode)!.gameState.Action = (team == 1 ? "team1Banning" : "team2Banning");
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = (team == 1 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team1, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}]);
            draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
  
            const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
            const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
  
            const gameState = draftLobbies.get(lobbyCode)!.gameState;
              
            const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
            io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
            // Start Timer for next ban
            setTimeout(function() {
              // Banning Logic
              let bannedHero = ""
              let highestVotes = 0;
              if(team == 1) {
                Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
                  if(value.size > highestVotes) {
                    highestVotes = value.size;
                    bannedHero = key;
                  }
                });
              } else {
                Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
                  if(value.size > highestVotes) {
                    highestVotes = value.size;
                    bannedHero = key;
                  }
                });
              }
              if(highestVotes == 0) {
                bannedHero = randomHero(lobbyCode);
              }
              console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
              if(team==1){
                draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
              }else{
                draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
              }
              draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
              heroWipe(lobbyCode);
    
              // State Changes
              draftLobbies.get(lobbyCode)!.gameState.Action = (team == 2 ? "team1Banning" : "team2Banning");
              draftLobbies.get(lobbyCode)!.gameState.ActiveUser = (team == 2 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}]);
              draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
    
              const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
              const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
    
              const gameState = draftLobbies.get(lobbyCode)!.gameState;
                
              const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
    
              io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
              setTimeout(function() {
                // Banning Logic
                let bannedHero = ""
                let highestVotes = 0;
                if(team == 2) {
                  Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam1.entries()).forEach(([key, value]) => {
                    if(value.size > highestVotes) {
                      highestVotes = value.size;
                      bannedHero = key;
                    }
                  });
                } else {
                  Array.from(draftLobbies.get(lobbyCode)!.voteBansTeam2.entries()).forEach(([key, value]) => {
                    if(value.size > highestVotes) {
                      highestVotes = value.size;
                      bannedHero = key;
                    }
                  });
                }
                if(highestVotes == 0) {
                  bannedHero = randomHero(lobbyCode);
                }
                console.log("bannedHero", bannedHero, "highestVotes", highestVotes);
                if(team==2){
                  draftLobbies.get(lobbyCode)!.bannedHeroesTeam1.push(bannedHero as Hero);
                }else{
                  draftLobbies.get(lobbyCode)!.bannedHeroesTeam2.push(bannedHero as Hero);
                }
                draftLobbies.get(lobbyCode)!.heroes.get(bannedHero as Hero)!.Status = "banned"
                heroWipe(lobbyCode);
      
                // State Changes
                draftLobbies.get(lobbyCode)!.gameState.Action = (team == 1 ? "team1Picking" : "team2Picking");
  
                if(team == 1) {
                  // Get the first player in the team
                  const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[0];
                  draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
                } else {
                  // Get the first player in the team
                  const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[0];
                  draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
                }
                
                draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
      
                const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
                const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
      
                const gameState = draftLobbies.get(lobbyCode)!.gameState;
                  
                const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
                io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
                draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? draftLobbies.get(lobbyCode)!.curTeamPick = 2 : draftLobbies.get(lobbyCode)!.curTeamPick = 1;
                draftLobbies.get(lobbyCode)!.gameState.TimeoutID = new Timeout(() => startTeamPick(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick, draftLobbies.get(lobbyCode)!.curPickPhase), (draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500);
              }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
            }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
          }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
        }, ((draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500));
        break;
    }     
  }

  //when to start ban phase
  const startBanPhase = (lobbyCode: string, socket: any, firstPick: number) => {
    console.log("numPickBan", draftLobbies.get(lobbyCode)!.settings.numPickBan);
        const numBan = draftLobbies.get(lobbyCode)!.settings.numPickBan;
        let curTeam = firstPick;
        if(numBan != "0") {
          draftLobbies.get(lobbyCode)!.gameState.ActiveUser = firstPick == 1 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team1, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}];
        }
        switch(numBan) {
          case "1":
            //wait gamestate.timer seconds before updating lobby to opposite team banning
            console.log("pickBan case statement", 1);
            startTeamBan(lobbyCode, socket, firstPick, 1);
            break;
          case "2":
            console.log("pickBan case statement", 2);
            startTeamBan(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick, 2);

          default:
            console.log("NO MATCH");
            break;
        }
  }

  function startLobby(lobbyCode: string, socket: any) {  
    if(draftLobbies.get(lobbyCode) != undefined) {
      console.log("Starting Lobby!", lobbyCode);
      draftLobbies.get(lobbyCode)!.inProgress = true;
      draftLobbies.get(lobbyCode)!.joinable = false;
      let playersReady:string[] = [];
      let playersNotReady:string[] = [];       //  create a loop function
      setTimeout(function() {   //  call a 3s setTimeout when the loop is called
        if(draftLobbies.get(lobbyCode) == undefined) {
          return;
        }
        console.log("Checking if players are ready...")
        if(draftLobbies.get(lobbyCode)!.settings.playersNeeded == 10){
          Array.from(draftLobbies.get(lobbyCode)!.players.values()).map((player: any, index) => {
            console.log(JSON.stringify(playersReady));
            console.log(JSON.stringify(player));
            if(player.Team == 0 || player.Role == "None") {
              playersNotReady.push(player.Name);
            } else {
              if(!(playersReady.includes(player.SocketID))) {
                playersReady.push(player.SocketID)//  increment the counter
              }              
            }
          });
        }else{
          Array.from(draftLobbies.get(lobbyCode)!.players.values()).map((player: any, index) => {
            console.log(JSON.stringify(playersReady));
            console.log(JSON.stringify(player));
            if(player.Team == 0) {
              playersNotReady.push(player.Name);
            } else {
              if(!(playersReady.includes(player.SocketID))) {
                playersReady.push(player.SocketID)//  increment the counter
              }              
            }
          });
          //Add Fake Players to Array to make full 10 Player Lobby 5 Players Each Team
  
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer1", {Username: "FakePlayer1", SocketID: "FakePlayer1", Team: 1, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer2", {Username: "FakePlayer2", SocketID: "FakePlayer2", Team: 1, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer3", {Username: "FakePlayer3", SocketID: "FakePlayer3", Team: 1, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer4", {Username: "FakePlayer4", SocketID: "FakePlayer4", Team: 1, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer5", {Username: "FakePlayer5", SocketID: "FakePlayer5", Team: 2, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer6", {Username: "FakePlayer6", SocketID: "FakePlayer6", Team: 2, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer7", {Username: "FakePlayer7", SocketID: "FakePlayer7", Team: 2, Role: "None", Hero: "", Status: "Ready"});
          draftLobbies.get(lobbyCode)!.players.set("FakePlayer8", {Username: "FakePlayer8", SocketID: "FakePlayer8", Team: 2, Role: "None", Hero: "", Status: "Ready"});
        }
        if (playersReady.length < 10) {
          console.log('Players not ready!')
          io.in(lobbyCode).emit('lobbyNotReady', JSON.stringify(playersNotReady));          //  if the counter < settings.playersNeeded, call the loop function
          startLobby(lobbyCode, socket);             //  ..  again which will trigger another 
        }else{
          console.log("All players ready");
          
          console.log("First pick - ", draftLobbies.get(lobbyCode)!.curTeamPick);
          if(parseInt(draftLobbies.get(lobbyCode)!.settings.numPickBan)> 0){
            //start ban phase
            draftLobbies.get(lobbyCode)!.gameState.Action = (draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? "team1Banning" : "team2Banning");
            draftLobbies.get(lobbyCode)!.gameState.ActiveUser = (draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? [{Username: draftLobbies.get(lobbyCode)!.gameState.Team1, SocketID: ""}] : [{Username: draftLobbies.get(lobbyCode)!.gameState.Team2, SocketID: ""}]);
            draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
        
            const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
            const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
        
            const gameState = draftLobbies.get(lobbyCode)!.gameState;
              
            const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
        
            io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
            startBanPhase(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick);
          } else {
            // Skip Ban Logic, Start Pick Logic
            draftLobbies.get(lobbyCode)!.gameState.Action = (draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? "team1Picking" : "team2Picking");
            if(draftLobbies.get(lobbyCode)!.curTeamPick == 1) {
              // Get the first player in the team
              const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1)[0];
              draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            } else {
              // Get the first player in the team
              const player = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2)[0];
              draftLobbies.get(lobbyCode)!.gameState.ActiveUser = [{Username: player.Username, SocketID: player.SocketID}];
            }
            // Initiate first pick
            draftLobbies.get(lobbyCode)!.gameState.Timer = 30;
  
            const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
            const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);
  
            const gameState = draftLobbies.get(lobbyCode)!.gameState;
              
            const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);
  
            io.in(lobbyCode).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
            draftLobbies.get(lobbyCode)!.curTeamPick == 1 ? draftLobbies.get(lobbyCode)!.curTeamPick = 2 : draftLobbies.get(lobbyCode)!.curTeamPick = 1;
            draftLobbies.get(lobbyCode)!.gameState.TimeoutID = new Timeout(() => startTeamPick(lobbyCode, socket, draftLobbies.get(lobbyCode)!.curTeamPick, draftLobbies.get(lobbyCode)!.curPickPhase), (draftLobbies.get(lobbyCode)!.gameState.Timer * 1000) - 500);
          }
          console.log("after switch case");
        }
      }, 5000)
      console.log("after setTimeout");
    }
  }

  io.on('connection', async (socket:any) => {

    console.log('a user connected - ' + socket.id + ' - ' + socket.handshake.query.request, socket.handshake.query.playersNeeded);

    //figure out which team has first pick/ban
    let playerName = socket.handshake.query.playerName;
    let firstPick;
    if(socket.handshake.query.team1FirstPick == 1) {
      firstPick = 1;
    } else {
      firstPick = Math.floor(Math.random() * 2) + 1;
    }

    //switchcases for different lobby requests
    switch(socket.handshake.query.request) {
      //create lobby
      case('createLobby'):
        const lobbyID = generateRandomHex(8);
        playerName = socket.handshake.query.playerName;
        socket.join(lobbyID);
        draftLobbies.set(lobbyID, {
          lobbyCode: lobbyID,
          settings: {
            mirrorMatchAllowed: socket.handshake.query.mirrorMatchAllowed,
            numPickBan: socket.handshake.query.numPickBan,
            aram: socket.handshake.query.aram,
            team1Name: socket.handshake.query.team1Name,
            team2Name: socket.handshake.query.team2Name,
            playersNeeded: socket.handshake.query.playersNeeded,
          },
          owner: socket.id,
          spectators: [],
          players: new Map<SocketID, Player>(),
          bannedHeroesTeam1: [],
          bannedHeroesTeam2: [],
          inProgress: false,
          joinable: true,
          voteBansTeam1: new Map<Hero, Set<SocketID>>(),
          voteBansTeam2: new Map<Hero, Set<SocketID>>(),
          votePicksTeam1: new Set<Hero>(),
          votePicksTeam2: new Set<Hero>(),
          hoverTeam1: new Map<Hero, Set<SocketID>>(),
          hoverTeam2: new Map<Hero, Set<SocketID>>(),
          status: "waiting",
          heroes: new Map<Hero, {Name: Hero, Status: "" | "picked" | "banned", Votes: number}>(),
          gameState: {
            "Action": "waiting",
            "ActiveUser": [{
              "SocketID": "",
              "Username": "",
            }],
            "Team1": socket.handshake.query.team1Name,
            "Team2": socket.handshake.query.team2Name,
            "Timer": 0,
            "PlayerCount": 0,
            "LobbyCode": lobbyID,
            "TimeoutID": null,
            "PlayersNeeded": socket.handshake.query.playersNeeded
          },
          curTeamPick: firstPick,
          curPickPhase: 1,
          curPicksInPhase: 0,
          tradeRequests: new Map<SocketID, SocketID>()
        });
        if(socket.handshake.query.spectator == 1) {
          //handle spectator logic
          console.log("create lobby as spectator");
          draftLobbies.get(lobbyID)!.spectators.push(socket.id);
        } else {
          console.log("create lobby as player")
          draftLobbies.get(lobbyID)!.players.set(socket.id, {
            SocketID: socket.id,
            Username: playerName,
            Team: 0,
            Role: "None",
            Hero: "",
            Status: "",
          });
          console.log(draftLobbies.get(lobbyID)!.players.get(socket.id));
        };

        //add functionality for the playercount in waiting state
        const playersConnected = (draftLobbies.get(lobbyID)!.players.size);
        draftLobbies.get(lobbyID)!.gameState.PlayerCount = playersConnected;

        //map player
        const serializedPlayers = JSON.stringify(Object.fromEntries(draftLobbies.get(lobbyID)!.players.entries()));
        console.log("serialized players", serializedPlayers);

        //convert player map to team specific arrays
        const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyID)!.players).filter(player => player.Team == 1);
        const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyID)!.players).filter(player => player.Team == 2);

        const gameState = draftLobbies.get(lobbyID)!.gameState;
        draftLobbies.get(lobbyID)!.heroes.set("Countess", {Name: "Countess", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Crunch", {Name: "Crunch", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Dekker", {Name: "Dekker", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Drongo", {Name: "Drongo", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("FengMao", {Name: "FengMao", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Fey", {Name: "Fey", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Gadget", {Name: "Gadget", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Gideon", {Name: "Gideon", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Greystone", {Name: "Greystone", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Grux", {Name: "Grux", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Howitzer", {Name: "Howitzer", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Kallari", {Name: "Kallari", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Khaimera", {Name: "Khaimera", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Kira", {Name: "Kira", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("LtBelica", {Name: "LtBelica", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Morigesh", {Name: "Morigesh", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Murdock", {Name: "Murdock", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Muriel", {Name: "Muriel", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Narbash", {Name: "Narbash", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Phase", {Name: "Phase", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Rampage", {Name: "Rampage", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Revenant", {Name: "Revenant", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Riktor", {Name: "Riktor", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Sevarog", {Name: "Sevarog", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Shinbi", {Name: "Shinbi", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Sparrow", {Name: "Sparrow", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Steel", {Name: "Steel", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Twinblast", {Name: "Twinblast", Status: "", Votes: 0});
        draftLobbies.get(lobbyID)!.heroes.set("Zarus", {Name: "Zarus", Status: "", Votes: 0});
        const heroes = heroMapToArray(draftLobbies.get(lobbyID)!.heroes);

        //emit event for clients
        socket.emit("lobbyJoin", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles});
        break;

      //join lobby
      case("joinLobby"):
        const lobbyCode = socket.handshake.query.lobbyCode;
        const spectator = socket.handshake.query.spectator;
        playerName = socket.handshake.query.playerName;

        //check if join request is for player or spectator
        if(spectator == 0) {
          //join as player
          if(io.sockets.adapter.rooms.has(lobbyCode)) {
            socket.join(lobbyCode);
            console.log("joined lobby as player " + lobbyCode);
            let playersConnected = (draftLobbies.get(lobbyCode)!.players.size);
            console.log("players conneceted - ", playersConnected);
            console.log("spectators connected - ", draftLobbies.get(lobbyCode)!.spectators.length);
            if(playersConnected < 10) {
              console.log("player joined - ", playerName);
              draftLobbies.get(lobbyCode)?.players.set(socket.id, {
                SocketID: socket.id,
                Username: playerName,
                Team: 0,
                Role: "None",
                Hero: "",
                Status: "",
              });

              const playersConnected = (draftLobbies.get(lobbyCode)!.players.size);
              draftLobbies.get(lobbyCode)!.gameState.PlayerCount = playersConnected;
              console.log("players connected - ", playersConnected);
              //map players
              const serializedPlayers = JSON.stringify(Object.fromEntries(draftLobbies.get(lobbyCode)!.players.entries()));

              //convert player map to team specific arrays
              const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
              const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);

              const gameState = draftLobbies.get(lobbyCode)!.gameState;
              const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);

              //emit event for clients
              socket.emit("lobbyJoin", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles});
              socket.to(lobbyCode).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles});
            } else {
              console.log("lobby is full");
              console.log("spectator joined - ", playerName);
              //join as spectator if lobby is already full
              draftLobbies.get(lobbyCode)?.spectators.push(socket.id);

              //convert player map to team specific arrays
              const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
              const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);  

              const gameState = draftLobbies.get(lobbyCode)!.gameState;
              const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);

              //emit event for clients
              socket.emit('lobbyJoin', {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles});              
            };

            playersConnected = (draftLobbies.get(lobbyCode)!.players.size);
            if(playersConnected >= draftLobbies.get(lobbyCode)!.settings.playersNeeded) {
              console.log(draftLobbies.get(lobbyCode)!.settings.playersNeeded, "players connected, starting lobby");
              startLobby(lobbyCode, socket);
            } else {
              console.log("lobby ist not full");
            };
          } else {
            console.log("lobby " + lobbyCode + " does not exist");
            socket.emit("lobbyNotFound");
            socket.disconnect();
          };
        } else {
          //join as spectator
          if(io.sockets.adapter.rooms.has(lobbyCode)) {
            socket.join(lobbyCode);
            console.log("joined lobby as spectator " + lobbyCode);
            draftLobbies.get(lobbyCode)?.spectators.push(socket.id);

            //convert player map to team specific arrays
            const team1Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 1);
            const team2Players: Player[] = playerMapToArray(draftLobbies.get(lobbyCode)!.players).filter(player => player.Team == 2);              

            const gameState = draftLobbies.get(lobbyCode)!.gameState;
            const heroes = heroMapToArray(draftLobbies.get(lobbyCode)!.heroes);

            //emit event for clients
            socket.emit("lobbyJoin", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles});  
          } else {
            console.log("lobby " + lobbyCode + " does not exist");
            socket.emit("lobbyNotFound");
            socket.diconnect();
          };
        };
        break;
    };
    
    //handle user disconnect
    socket.on("disconnecting", () => {
      console.log("user disconnecting");
      //if player is in a room, emit playerLeft
      if(socket?.rooms?.size > 1) {
        socket?.rooms?.forEach((room:any) => {
          socket.emit("lobbyUpdated");
        });
        console.log("player left")
      };
    });

    socket.on("disconnect", () => {
      console.log("user disconnected", socket.id);
    });

    //handle gamestate: waiting
    socket.on("waiting", (data: {lobbyCode: string, role: "Carry" | "Support" | "Midlane" | "Jungle" | "Offlane", team: string}) => {
      console.log("waiting screen", data);
      let teamNum = 0;

      if(data.team != undefined) {
        //handle click on team
        if(draftLobbies.get(data.lobbyCode)!.players.get(socket.id) != undefined) {
          //convert team name to team number
          if(data.team == draftLobbies.get(data.lobbyCode)!.gameState.Team1) {
            draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Team = 1;
            teamNum = 1;
          } else {
            draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Team = 2;
            teamNum = 2;
          };
        };
      };

      if(data.role != undefined) {
        //handle click on role
        if(draftLobbies.get(data.lobbyCode)!.players.get(socket.id) != undefined) {
          draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Role = data.role;
        };
      };

      if(teamNum != 0) {
        socket.rooms.forEach((room:any) => {
          //leave room if lobby code is not existing
          if(room != data.lobbyCode) {
            socket.leave(room);
          };
        });
        socket.join(data.lobbyCode + teamNum);
        console.log(socket.id + " joined room - " + data.lobbyCode + teamNum)
      }

      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);

      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);
      
      //emit event for clients
      io.in(data.lobbyCode).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2});
    
    });

    //handle gamestate: team1Banning
    socket.on("team1Banning", (data: {lobbyCode: string, hero: Hero}) => {
      console.log("Team 1 Banning Vote - ", data, socket.id);

      if(draftLobbies.get(data.lobbyCode)!.voteBansTeam1.get(data.hero)) {
        const votes = draftLobbies.get(data.lobbyCode)!.voteBansTeam1.get(data.hero)!;
        if(votes.has(socket.id)) {
          //player is removing vote by clicking the same champ again
          votes.delete(socket.id);
        } else {
          //player is changing vote
          Array.from(draftLobbies.get(data.lobbyCode)!.voteBansTeam1.entries()).forEach(([hero, votes]) => {
            votes.delete(socket.id);
          });
          votes.add(socket.id);
        };
      } else {
        //check for previous votes & create new set of votes for this hero and add players vote
        Array.from(draftLobbies.get(data.lobbyCode)!.voteBansTeam1.entries()).forEach(([hero, votes]) => {
          votes.delete(socket.id);
        });
        draftLobbies.get(data.lobbyCode)!.voteBansTeam1.set(data.hero, new Set([socket.id]));
      };

      heroVoteUpdater(draftLobbies.get(data.lobbyCode)!.voteBansTeam1, data.lobbyCode);
      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);
  
      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);
  
      const lobbyID = data.lobbyCode + 1;

      //emit event for clients
      io.in(lobbyID).emit('lobbyUpdated', {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2});
    });

    //handle gamestate: team2Banning
    socket.on("team2Banning", (data: {lobbyCode: string, hero: Hero}) => {
      console.log("Team 2 Banning Vote - ", data, socket.id);

      if(draftLobbies.get(data.lobbyCode)!.voteBansTeam2.get(data.hero)) {
        const votes = draftLobbies.get(data.lobbyCode)!.voteBansTeam2.get(data.hero)!;
        if(votes.has(socket.id)) {
          //player is removing vote by clicking the same champ again
          votes.delete(socket.id);
        } else {
          //player is changing vote
          Array.from(draftLobbies.get(data.lobbyCode)!.voteBansTeam2.entries()).forEach(([hero, votes]) => {
            votes.delete(socket.id);
          });
          votes.add(socket.id);
        };
      } else {
        //check for previous votes & create new set of votes for this hero and add players vote
        Array.from(draftLobbies.get(data.lobbyCode)!.voteBansTeam2.entries()).forEach(([hero, votes]) => {
          votes.delete(socket.id);
        });
        draftLobbies.get(data.lobbyCode)!.voteBansTeam2.set(data.hero, new Set([socket.id]));
      };

      heroVoteUpdater(draftLobbies.get(data.lobbyCode)!.voteBansTeam2, data.lobbyCode);
      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);
  
      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);
  
      const lobbyID = data.lobbyCode + 2;

      //emit event for clients
      io.in(lobbyID).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Heroes: heroes, Roles: Roles, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2});
    });

    //handle heroHover 
    socket.on("heroHover", (data: {lobbyCode: string, hero: Hero, team: string}) => {
      let curTeam = 0;
      if(data.team == draftLobbies.get(data.lobbyCode)!.gameState.Team1) {
        curTeam = 1;
      } else if(data.team == draftLobbies.get(data.lobbyCode)!.gameState.Team2) {
        curTeam = 2;
      };

      console.log("Hero Hover - ", data, socket.id);

      if(draftLobbies.get(data.lobbyCode)!.settings.playersNeeded == 10) {
        if(curTeam == 1) {
          //check if socket is in room, if not --> join
          if(draftLobbies.get(data.lobbyCode)!.hoverTeam1.has(data.hero)) {
            const hovers = draftLobbies.get(data.lobbyCode)!.hoverTeam1.get(data.hero)!;
            if(hovers.has(socket.id)) {
              //player is removing vote by clicking same hero again
              console.log("removing vote for " + data.hero + " by " + socket.id + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Hero = data.hero;
              Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam1.entries()).forEach(([hero, votes]) => {
                votes.delete(socket.id);
              });
              hovers.add(socket.id);
            };
          } else {
            //check for prev votes & create new set of votes for this hero and add players vote 
            console.log("adding vote for " + data.hero + " by " + socket.id, " in lobby " + data.lobbyCode);
            draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Hero = data.hero;
            Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam1.entries()).forEach(([hero, votes]) => {
              votes.delete(socket.id);
            });
            draftLobbies.get(data.lobbyCode)!.hoverTeam1.set(data.hero, new Set([socket.id]));
          };
          hoverUpdater(draftLobbies.get(data.lobbyCode)!.hoverTeam1, data.lobbyCode);
        } else if(curTeam == 2) {
          //check if socket is in room, if not --> join
          if(draftLobbies.get(data.lobbyCode)!.hoverTeam2.has(data.hero)) {
            const hovers = draftLobbies.get(data.lobbyCode)!.hoverTeam2.get(data.hero)!;
            if(hovers.has(socket.id)) {
              //player is removing vote by clicking same hero again
              console.log("removing vote for " + data.hero + " by " + socket.id + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Hero = data.hero;
              Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam2.entries()).forEach(([hero, votes]) => {
                votes.delete(socket.id);
              });
              hovers.add(socket.id);
            };
          } else {
            //check for prev votes & create new set of votes for this hero and add players vote 
            console.log("adding vote for " + data.hero + " by " + socket.id, " in lobby " + data.lobbyCode);
            draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Hero = data.hero;
            Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam2.entries()).forEach(([hero, votes]) => {
              votes.delete(socket.id);
            });
            draftLobbies.get(data.lobbyCode)!.hoverTeam2.set(data.hero, new Set([socket.id]));
          };
          hoverUpdater(draftLobbies.get(data.lobbyCode)!.hoverTeam2, data.lobbyCode);
        };
      } else if(draftLobbies.get(data.lobbyCode)!.settings.playersNeeded == 2) {
        if(curTeam == 1) {

          //get socket id of one of the gamestate.activeusers that do not have a status of picked
          let activeUser = Array.from(draftLobbies.get(data.lobbyCode)!.gameState.ActiveUser.values()).find((user) => draftLobbies.get(data.lobbyCode)!.players.get(user.SocketID)!.Status != 'picked');

          //check if socket is in room, if not --> join
          if(draftLobbies.get(data.lobbyCode)!.hoverTeam1.has(data.hero)) {
            const hovers = draftLobbies.get(data.lobbyCode)!.hoverTeam1.get(data.hero)!;
            if(hovers.has(activeUser!.SocketID)) {
              //player is removing their vote by voting for the same hero again
              console.log("removing vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = '';
              hovers.delete(activeUser!.SocketID);
            } else {
              //player is changing their vote
              console.log("changing vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = data.hero;
              Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam1.entries()).forEach(([hero, votes]) => {
                votes.delete(activeUser!.SocketID);
              });
              hovers.add(activeUser!.SocketID);
            };
          } else {
            //check for prev vote & create new set of votes for this hero and add players vote
            console.log("adding vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
            draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = data.hero;
            Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam1.entries()).forEach(([hero, votes]) => {
              votes.delete(activeUser!.SocketID);
            });
            draftLobbies.get(data.lobbyCode)!.hoverTeam1.set(data.hero, new Set([activeUser!.SocketID]));
          };
          hoverUpdater(draftLobbies.get(data.lobbyCode)!.hoverTeam1, data.lobbyCode);
        } else if(curTeam == 2) {

          //get socket id of one of the gamestate.activeusers that do not have a status of picked
          let activeUser = Array.from(draftLobbies.get(data.lobbyCode)!.gameState.ActiveUser.values()).find((user) => draftLobbies.get(data.lobbyCode)!.players.get(user.SocketID)!.Status != 'picked');

          //check if socket is in room, if not --> join
          if(draftLobbies.get(data.lobbyCode)!.hoverTeam2.has(data.hero)) {
            const hovers = draftLobbies.get(data.lobbyCode)!.hoverTeam2.get(data.hero)!;
            if(hovers.has(activeUser!.SocketID)) {
              //player is removing their vote by voting for the same hero again
              console.log("removing vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = '';
              hovers.delete(activeUser!.SocketID);
            } else {
              //player is changing their vote
              console.log("changing vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
              draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = data.hero;
              Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam2.entries()).forEach(([hero, votes]) => {
                votes.delete(activeUser!.SocketID);
              });
              hovers.add(activeUser!.SocketID);
            };
          } else {
            //check for prev vote & create new set of votes for this hero and add players vote
            console.log("adding vote for " + data.hero + " by " + activeUser!.SocketID + " in lobby " + data.lobbyCode);
            draftLobbies.get(data.lobbyCode)!.players.get(activeUser!.SocketID)!.Hero = data.hero;
            Array.from(draftLobbies.get(data.lobbyCode)!.hoverTeam2.entries()).forEach(([hero, votes]) => {
              votes.delete(activeUser!.SocketID);
            });
            draftLobbies.get(data.lobbyCode)!.hoverTeam2.set(data.hero, new Set([activeUser!.SocketID]));
          };
          hoverUpdater(draftLobbies.get(data.lobbyCode)!.hoverTeam2, data.lobbyCode);
        };
      }

      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);
  
      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);

      const lobbyID = data.lobbyCode + curTeam;

      //emit event for client
      io.in(lobbyID).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});      
    });

    socket.on("team1Picking", (data: {lobbyCode: string, hero: Hero}) => {
      if(draftLobbies.get(data.lobbyCode)!.gameState.Action != "team1Picking") return;
      if(draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Team != 1) return;
      console.log("Team 1 Picking Vote- ", data, socket.id);
      let localSocketID = socket.id;
      if(draftLobbies.get(data.lobbyCode)!.settings.playersNeeded == 2){
        localSocketID = Array.from(draftLobbies.get(data.lobbyCode)!.gameState.ActiveUser.values()).find((user) => draftLobbies.get(data.lobbyCode)!.players.get(user.SocketID)!.Hero == data.hero)!.SocketID;
      }
  
      if(draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status != 'banned' || draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status != 'picked') {
        draftLobbies.get(data.lobbyCode)!.players.get(localSocketID)!.Hero = data.hero;
        draftLobbies.get(data.lobbyCode)!.players.get(localSocketID)!.Status = 'picked';
        draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status = 'picked';
        draftLobbies.get(data.lobbyCode)!.curPicksInPhase = draftLobbies.get(data.lobbyCode)!.curPicksInPhase + 1;
      }
      if(draftLobbies.get(data.lobbyCode)!.curPickPhase > 1  && draftLobbies.get(data.lobbyCode)!.curPickPhase < 6) {
        if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase < 2) {
          console.log("Need another pick")
        }else if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase == 2){
          console.log("All picks done, starting next phase!")
          if(draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.isPending ) {
            draftLobbies.get(data.lobbyCode)!.curPicksInPhase = 0;
            draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.execute();
          }
        }
      }else {
        if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase == 1) {
          console.log("All picks done, starting next phase!")
          if(draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.isPending ) {
            draftLobbies.get(data.lobbyCode)!.curPicksInPhase = 0;
            draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.execute();
          }
        }
      }
  
      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);
  
      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);
      
      if(draftLobbies.get(data.lobbyCode)!.settings.mirrorMatchAllowed == '1'){
        // if mirror match is allowed, we should keep picks teamside and allow the other team to pick the same heroes
        console.log("Mirror Match Allowed");
        const lobbyID = data.lobbyCode + 1;
        draftLobbies.get(data.lobbyCode)!.votePicksTeam1.add(data.hero);
        draftLobbies.get(data.lobbyCode)!.votePicksTeam1.forEach((hero) => {
          draftLobbies.get(data.lobbyCode)!.heroes.get(hero)!.Status = 'picked';
        });
        io.in(lobbyID).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
        heroStatusWipe(data.lobbyCode);
        const lobbyID2 = data.lobbyCode + 2;
        io.in(lobbyID2).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
      }else{
        console.log("Mirror Match Not Allowed");
        io.in(data.lobbyCode).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
      };
    });
  
    socket.on("team2Picking", (data: {lobbyCode: string, hero: Hero}) => {
      if(draftLobbies.get(data.lobbyCode)!.gameState.Action != "team2Picking") return;
      if(draftLobbies.get(data.lobbyCode)!.players.get(socket.id)!.Team != 2) return;
      console.log("Team 2 Picking Vote- ", data, socket.id);
      let localSocketID = socket.id;
      if(draftLobbies.get(data.lobbyCode)!.settings.playersNeeded == 2){
        localSocketID = Array.from(draftLobbies.get(data.lobbyCode)!.gameState.ActiveUser.values()).find((user) => draftLobbies.get(data.lobbyCode)!.players.get(user.SocketID)!.Hero == data.hero)!.SocketID;
      };
      if(draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status != 'banned' || draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status != 'picked') {
        draftLobbies.get(data.lobbyCode)!.curPicksInPhase = draftLobbies.get(data.lobbyCode)!.curPicksInPhase + 1;
        draftLobbies.get(data.lobbyCode)!.players.get(localSocketID)!.Hero = data.hero;
        draftLobbies.get(data.lobbyCode)!.players.get(localSocketID)!.Status = 'picked';
        draftLobbies.get(data.lobbyCode)!.heroes.get(data.hero)!.Status = 'picked';
      };
  
      if(draftLobbies.get(data.lobbyCode)!.curPickPhase > 1  && draftLobbies.get(data.lobbyCode)!.curPickPhase < 6) {
        if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase < 2) {
          console.log("Need another pick");
        }else if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase == 2){
          console.log("All picks done, starting next phase!");
          if(draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.isPending ) {
            draftLobbies.get(data.lobbyCode)!.curPicksInPhase = 0;
            draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.execute();
          };
        };
      }else {
        if(draftLobbies.get(data.lobbyCode)!.curPicksInPhase == 1) {
          console.log("All picks done, starting next phase!");
          if(draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.isPending ) {
            draftLobbies.get(data.lobbyCode)!.curPicksInPhase = 0;
            draftLobbies.get(data.lobbyCode)!.gameState.TimeoutID.execute();
          };
        };
      };

      //convert player map to team specific arrays
      const team1Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 1);
      const team2Players: Player[] = playerMapToArray(draftLobbies.get(data.lobbyCode)!.players).filter(player => player.Team == 2);
  
      const gameState = draftLobbies.get(data.lobbyCode)!.gameState;
      const heroes = heroMapToArray(draftLobbies.get(data.lobbyCode)!.heroes);
      
      if(draftLobbies.get(data.lobbyCode)!.settings.mirrorMatchAllowed == '1'){
        console.log("mirror match allowed");
        // if mirror match is allowed, we should keep picks teamside and allow the other team to pick the same heroes
        const lobbyID = data.lobbyCode + 2;
        draftLobbies.get(data.lobbyCode)!.votePicksTeam2.add(data.hero);
        draftLobbies.get(data.lobbyCode)!.votePicksTeam2.forEach((hero) => {
          draftLobbies.get(data.lobbyCode)!.heroes.get(hero)!.Status = 'picked';
        });
        io.in(lobbyID).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
        heroStatusWipe(data.lobbyCode);
        const lobbyID2 = data.lobbyCode + 1;
        io.in(lobbyID2).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
      }else{
        console.log("no mirror match");
        io.in(data.lobbyCode).emit("lobbyUpdated", {GameState: gameState, Team1: team1Players, Team2: team2Players, Team1Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam1, Team2Banned: draftLobbies.get(data.lobbyCode)!.bannedHeroesTeam2, Heroes: heroes, Roles: Roles});
      };
    });    
  
  });
  
  const removeEmptyLobbies = () => {
    console.log("checking for empty lobbies")
    draftLobbies.forEach((lobby, lobbyCode) => {
      if(!(io.sockets.adapter.rooms.has(lobbyCode))) {
        console.log("lobby " + lobbyCode + " is empty, removing");
        draftLobbies.get(lobbyCode)?.gameState?.TimeoutID?.cancel();
        draftLobbies.delete(lobbyCode);
      };
    });
  };
  
  

// for test purposes
server.listen(3001, () => {
    console.log('Server schaut auf Port 3001')
})


//initializes admin ui without authentification on admin.socket.io
instrument(io, {
    auth: false 
})
