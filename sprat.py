import json
import random
from random import choice
from string import ascii_uppercase


use_random = True

SUITS = "HEARTS", "DIAMONDS", "SPADES", "CLUBS"
FACES = "ACE", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"

ASSET_FACE_OVERRIDES = {
    "j": "jack",
    "q": "queen",
    "k": "king",
    # "10": "ten"
}

SUIT_COLOR = {
    "HEARTS": "RED",
    "DIAMONDS": "RED",
    "SPADES": "BLACK",
    "CLUBS": "BLACK"
}

class Card(object):
    def __init__(self, player, suit, face):
        self.player = player
        self.suit = suit
        self.face = face
    def __str__(self):
        return self.player[0] + self.face[0] + self.suit[0]
    def asset(self):
        asset_face = self.face.lower()
        if asset_face in ASSET_FACE_OVERRIDES:
            asset_face = ASSET_FACE_OVERRIDES[asset_face]
        asset_suit = self.suit.lower()
        return "{}_of_{}.png".format(asset_face, asset_suit)
    def __repr__(self):
        return "Card(o={}, s={}, f={})".format(self.player, self.suit, self.face)

def mk_deck(player):
    for s in SUITS:
        for f in FACES:
            yield Card(player, s, f)

class SpratDeck(object):
    def __init__(self, cards):
        self.top_card = cards[0]
        self.other_cards = cards[1:]
    def get(self):
        result = self.top_card
        if len(self.other_cards) > 0:
            self.top_card = self.other_cards.pop(0)
        else:
            self.top_card = None
        return result
    def un_get(self, card):
        was_top = self.top_card
        self.other_cards.append(was_top)
        self.top_card = card
    def is_sprat(self):
        return self.top_card is None
    def count(self):
        return len(self.other_cards) + (self.top_card is not None and 1 or 0)
    def __repr__(self):
        return "SpratDeck(top={top})".format(top=self.top_card)

class Pile(object):
    def __init__(self, card):
        self.cards = [card]
    def can_place(self, card):
        if len(self.cards) == 0:
            return True
        last_card = self.cards[-1]
        
        last_card_face_index = FACES.index(last_card.face)
        card_face_index = FACES.index(card.face)
        decreases_by_one = last_card_face_index == card_face_index + 1
        
        last_card_color = SUIT_COLOR[last_card.suit]
        card_color = SUIT_COLOR[card.suit]
        different_suit = last_card_color != card_color

        return decreases_by_one and different_suit
    def place(self, card):
        self.cards.append(card)
    def __str__(self):
        return "Pile(" + ",".join(str(c) for c in self.cards)+ ")"
    def __repr__(self):
        return "Pile({})".format(self.cards)

class FlipDeck(object):
    def __init__(self, cards):
        self.in_hand = cards
        self.on_table = []
    def flip(self):
        if len(self.in_hand) == 0:
            self.in_hand = self.on_table
            self.on_table = []
        for i in range(3):
            if len(self.in_hand) == 0:
                break
                
            flip = self.in_hand.pop(0)
            self.on_table.append(flip)
        print "new state:", self.on_table
    def get(self):
        return self.on_table.pop()
    def __repr__(self):
        return "FlipDeck(showing={})".format(len(self.on_table) > 0 and self.on_table[-1] or None)

class SpratGamePlayerState(object):
    def __init__(self, name):
        self.name = name
        deck = list(mk_deck(name))
        if use_random:
            random.shuffle(deck)
        self.sprat_deck = SpratDeck(deck[:13])
        self.piles = {}
        for pile_index in range(4):
            deck_slice = deck[13+pile_index:13+pile_index+1][0]
            self.piles[pile_index] = Pile(deck_slice)
        self.flip_deck = FlipDeck(deck[13+4:])
    def show(self):
        print "---"
        print self.sprat_deck
        print "piles:"
        for pile in self.piles:
            print " - ", self.piles[pile]
        print self.flip_deck
    def __repr__(self):
        return "SpratGamePlayerState(name={name}, )".format(name=self.name)

class AcePile(object):
    def __init__(self):
        self.cards = []
    def can_place(self, card):
        if len(self.cards)==0:
            return card.face == "ACE"

        print "ace pile can_place check:",self.cards
        same_suit = self.cards[0].suit == card.suit
        
        last_card_face_index = FACES.index(self.cards[-1].face)
        card_face_index = FACES.index(card.face)
        increase_by_one = last_card_face_index + 1 == card_face_index
        return same_suit and increase_by_one
    def place(self, card):
        self.cards.append(card)
    def count(self):
        counts = {}
        for card in self.cards:
            if card.player in counts:
                counts[card.player] += 1
            else:
                counts[card.player] = 1
        return counts
    
    def __repr__(self):
        return "AcePile({})".format(self.cards)

COULD_NOT_MOVE = "COULD NOT MOVE!"
class SpratGameState(object):
    def __init__(self, players):
        self.players = players

        self.player_states = {}
        self.ace_piles = {}
        for player in players:
            self.player_states[player] = SpratGamePlayerState(player)
        for suit in SUITS:
            self.ace_piles[suit] = {}
            for player in players:
                self.ace_piles[suit][player] = AcePile()
        
        for player in players:
            print player, self.player_states[player]
    # def can_to_ace_piles(self, card):
    def show(self):
        print "Ace Piles:"
        for suit in SUITS:
            for player in self.players:
                print " -", self.ace_piles[suit][player]
        for player in self.players:
            self.player_states[player].show()
    def get_ace_piles(self):
        return [self.ace_piles[suit][player].cards[-1] for suit in SUITS for player in self.players if len(self.ace_piles[suit][player].cards) > 0]
    def to_ace_piles(self, card):
        for suit in SUITS:
            for player in self.players:
                if self.ace_piles[suit][player].can_place(card):
                    self.ace_piles[suit][player].place(card)
                    return "moved {} to ace pile".format(card)
        for pile_index, pile in self.player_states[card.player].piles.items():
            if pile.can_place(card) and len(pile.cards) > 0:
                pile.place(card)
                return "moved {} to pile {} (prefer nonempty)".format(card, pile_index)
        
        for pile_index, pile in self.player_states[card.player].piles.items():
            if pile.can_place(card):
                pile.place(card)
                return "moved {} to pile {} (fallback to empty)".format(card, pile_index)
        
        return COULD_NOT_MOVE
    def count_scores(self):
        result = {}
        for player in self.players:
            for suit in SUITS:
                ace_pile_count = self.ace_piles[suit][player].count()
                for apc_player, count in ace_pile_count.items():
                    if apc_player in result:
                        result[apc_player] += count
                    else:
                        result[apc_player] = count
        return result
    def count_sprats(self):
        return {player:self.player_states[player].sprat_deck.count() for player in self.players}
            

from flask import Flask, url_for, render_template, flash, redirect, jsonify
app = Flask(__name__)
app.secret_key = 'some_secret'

player_map = {}
sgs_map = {}

def get_token():
    return(''.join(choice(ascii_uppercase) for i in range(4)))

@app.route("/new_game")
def new_game():
    new_token = get_token()
    player_map[new_token] = []
    return new_token
@app.route("/add_player/<game_token>/<player>")
def add_player(game_token, player):
    player_map[game_token].append(player)
    return "added {} to game {}".format(player, game_token)

@app.route("/start_game/<game_token>")
def start_game(game_token):
    if game_token in sgs_map:
        return "ERROR: can not restart an already started game"
    sgs_map[game_token] = SpratGameState(player_map[game_token])
    return "GO FOR LAUNCH!"

@app.route("/game_states")
def game_states():
    return jsonify({
        "player_map": player_map,
        "sgs_map": sgs_map.keys(),
    })

@app.route('/<game_token>/sprat_to_ace/<player>')
def sprat_to_ace(game_token, player):
    sgs = sgs_map[game_token]
    player_state = sgs.player_states[player]
    res = player_state.sprat_deck.get()
    result = sgs.to_ace_piles(res)
    if result == COULD_NOT_MOVE:
        player_state.sprat_deck.un_get(res)
    flash(result)
    return redirect(url_for('html_sgs', game_token=game_token, player=player))

@app.route('/<game_token>/pile_to_ace/<player>/<int:pile>')
def pile_to_ace(game_token, player, pile):
    sgs = sgs_map[game_token]
    player_state = sgs.player_states[player]
    print player_state.piles[pile].cards
    res = player_state.piles[pile].cards.pop()
    result = sgs.to_ace_piles(res)
    if result == COULD_NOT_MOVE:
        player_state.piles[pile].cards.append(res)
    flash(result)
    return redirect(url_for('html_sgs', game_token=game_token, player=player))

@app.route('/<game_token>/stack_to_ace/<player>/<int:pile>/<int:pile_index>')
def stack_to_ace(game_token, player, pile, pile_index):
    sgs = sgs_map[game_token]
    player_state = sgs.player_states[player]
    stack = player_state.piles[pile].cards[pile_index:]
    player_state.piles[pile].cards[pile_index:] = []
    res = stack[0]
    result = sgs.to_ace_piles(res)
    if result == COULD_NOT_MOVE:
        player_state.piles[pile].cards.extend(stack)
    else:
        stack.pop(0)
        while len(stack) > 0:
            res = stack.pop(0)
            sgs.to_ace_piles(res)
    flash(result)
    return redirect(url_for('html_sgs', game_token=game_token, player=player))
    

@app.route('/<game_token>/flip_to_ace/<player>')
def flip_to_ace(game_token, player):
    sgs = sgs_map[game_token]
    player_state = sgs.player_states[player]
    res = player_state.flip_deck.get()
    result = sgs.to_ace_piles(res)
    if result == COULD_NOT_MOVE:
        player_state.flip_deck.on_table.append(res)
    flash(result)
    return redirect(url_for('html_sgs', game_token=game_token, player=player))

@app.route("/<game_token>/flip/<player>")
def flip(game_token, player):
    sgs = sgs_map[game_token]
    cur_player = sgs.player_states[player]
    cur_player.flip_deck.flip()
    flash("flipped flip deck")
    return redirect(url_for('html_sgs', game_token=game_token, player=player))

@app.route('/<game_token>/<player>')
def html_sgs(game_token, player):
    sgs = sgs_map[game_token]
    winners = [player for player, state in sgs.player_states.items() if state.sprat_deck.top_card is None]
    if len(winners) > 0:
        flash("game is over!, won by {}".format(winners))
    cur_player = sgs.player_states[player]
    return render_template('main.html', 
        winners=winners,
        player=player,
        ace_piles=sgs.get_ace_piles(),
        sprat_top=cur_player.sprat_deck.top_card,
        piles=cur_player.piles,
        flip_deck=cur_player.flip_deck,
        round_stats=sgs.count_scores(),
        sprat_stats=sgs.count_sprats(),
        game_token=game_token,
    )

if __name__ == '__main__':
    import socket
    if socket.gethostname() == "nash":
        hostname = "traviscj.com"
    else:
        hostname = "127.0.0.1"
    app.run(hostname, debug=True)


# sgs.player_states["traviscj"].show()
# sgs.player_states["traviscj"].show_flip()
# sgs.player_states["traviscj"].show()
# sgs.player_states["traviscj"].show_flip()
# sgs.player_states["traviscj"].show()